import os
import json
import tempfile
import socket
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager

DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'db.json'))

# Detect database URL from env
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
USE_POSTGRES = bool(DATABASE_URL)

if USE_POSTGRES:
    try:
        from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
        parsed = urlparse(DATABASE_URL)
        hostname = parsed.hostname
        port = parsed.port or 5432
        if hostname:
            # Force IPv4 lookup for the host name in Python using standard DNS resolution
            addr_info = socket.getaddrinfo(hostname, port, socket.AF_INET)
            if addr_info:
                ip = addr_info[0][4][0]
                print(f"[Database] Patched connection string: resolved {hostname} to IPv4 {ip}")
                query_params = dict(parse_qsl(parsed.query))
                query_params['hostaddr'] = ip
                new_query = urlencode(query_params)
                new_parts = list(parsed)
                new_parts[4] = new_query
                DATABASE_URL = urlunparse(new_parts)
    except Exception as e:
        print("[Database] Failed to apply hostaddr patch:", e)

# Connection Pool Instance
pool = None

def init_pool():
    global pool
    if USE_POSTGRES and pool is None:
        try:
            # Thread-safe pool: min 1, max 10 connections
            pool = ThreadedConnectionPool(1, 10, DATABASE_URL)
            print("[Database] PostgreSQL connection pool initialized successfully.")
        except Exception as e:
            print("[Database] ERROR: Failed to initialize PostgreSQL pool:", e)
            raise e

# Initialize connection pool if Postgres is enabled
if USE_POSTGRES:
    try:
        init_pool()
    except Exception:
        # If initializing fails in development (with DATABASE_URL set) or production, raise it
        pass

@contextmanager
def get_db_connection():
    if not USE_POSTGRES:
        raise RuntimeError("SQL Database is not configured. Falling back to local JSON.")
        
    global pool
    if pool is None:
        init_pool()
        if pool is None:
            raise RuntimeError("Database connection pool is not initialized.")
            
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)

def execute_query(query, params=None, fetch=False):
    if not USE_POSTGRES:
        raise RuntimeError("SQL Database is not configured.")
        
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                if fetch:
                    return cur.fetchall()
                conn.commit()
                return True
    except psycopg2.OperationalError as e:
        print("[Database] Connection lost or stale. Reinitializing pool...")
        # Discard the stale pool
        global pool
        if pool is not None:
            try:
                pool.closeall()
            except Exception:
                pass
        pool = None
        init_pool()
        
        # Retry the operation exactly once. If this fails, let the error bubble up
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                if fetch:
                    return cur.fetchall()
                conn.commit()
                return True

def parse_json_field(val):
    if not val:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return val

DEFAULT_STATE = {
  "leads": [],
  "notifications": [],
  "settings": {
    "systemPrompt": (
      "You are an AI Appointment Setter for 'Apex Digital Solutions'. Your goal is to qualify the lead conversationally.\n"
      "Do NOT present a boring questionnaire. Ask questions naturally one by one in a friendly, conversational tone.\n\n"
      "Your goals:\n"
      "1. Answer any FAQs the lead has using only the custom knowledge base. If you don't know the answer, say you will note it down for our human team.\n"
      "2. Qualify the lead by discovering their requirements based on the custom qualification list.\n"
      "3. Once you have qualified their details:\n"
      "   - Ask for their Name and Email address to confirm details.\n"
      "   - Once they provide Name and Email, output the exact token: [SHOW_CALENDAR]\n"
      "     This token is critical. It will automatically load the calendar scheduling UI so they can select a time slot.\n\n"
      "Be concise, warm, and professional. Always keep your replies under 3 sentences unless answering a detailed FAQ."
    ),
    "faqs": [
      {
        "id": "faq-1",
        "question": "What does Apex Digital Solutions do?",
        "answer": "We are a full-service digital agency specializing in custom web applications, AI integrations, automation workflows, and cloud migrations."
      },
      {
        "id": "faq-2",
        "question": "What is your pricing model?",
        "answer": "Our custom solutions typically start at $3,000 depending on the complexity, integrations, and timeline. We offer fixed-price projects and monthly retainer options."
      },
      {
        "id": "faq-3",
        "question": "How long does a typical project take?",
        "answer": "A standard web app or automation project takes between 4 to 8 weeks. Larger enterprise projects can take 3 months or more."
      }
    ],
    "qualifications": [
      {
        "id": "need",
        "label": "Project Need",
        "description": "What problem are they trying to solve?",
        "enabled": True
      },
      {
        "id": "budget",
        "label": "Estimated Budget",
        "description": "Do they have at least $3,000 for this project?",
        "enabled": True
      },
      {
        "id": "timeline",
        "label": "Target Timeline",
        "description": "Are they looking to start within 1-3 months?",
        "enabled": True
      }
    ],
    "resendApiKey": "",
    "twilioSid": "",
    "twilioToken": "",
    "twilioFromNumber": "",
    "ownerPhoneNumber": "",
    "googleCalendar": {
      "clientId": "",
      "clientSecret": "",
      "refreshToken": "",
      "isEnabled": False,
      "isMockMode": True
    }
  }
}

# ─────────────────────────────────────────────────────────────
# Local JSON Fallback Read/Write Functions
# ─────────────────────────────────────────────────────────────

def read_db():
    try:
        if not os.path.exists(DB_FILE):
            write_db(DEFAULT_STATE)
            return DEFAULT_STATE
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print('Error reading database:', e)
        return DEFAULT_STATE

def write_db(data):
    try:
        db_dir = os.path.dirname(DB_FILE)
        fd, temp_path = tempfile.mkstemp(dir=db_dir, suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        if os.path.exists(DB_FILE):
            os.replace(temp_path, DB_FILE)
        else:
            os.rename(temp_path, DB_FILE)
        return True
    except Exception as e:
        print('Error writing database:', e)
        return False

# ─────────────────────────────────────────────────────────────
# JSON-only CRUD Fallbacks
# ─────────────────────────────────────────────────────────────

def get_leads_json(client_id='default'):
    db = read_db()
    leads = db.get("leads", [])
    return [l for l in leads if l.get("clientId", 'default') == client_id]

def save_lead_json(lead, client_id='default'):
    db = read_db()
    leads = db.setdefault("leads", [])
    if "clientId" not in lead:
        lead["clientId"] = client_id
    elif not lead["clientId"]:
        lead["clientId"] = client_id
    index = -1
    for i, l in enumerate(leads):
        if l.get("id") == lead.get("id"):
            index = i
            break
    import datetime
    now_str = datetime.datetime.utcnow().isoformat() + 'Z'
    if index != -1:
        leads[index] = {**leads[index], **lead, "updatedAt": now_str}
    else:
        lead["createdAt"] = now_str
        lead["updatedAt"] = now_str
        leads.append(lead)
    write_db(db)
    return lead

def delete_lead_json(lead_id, client_id='default'):
    db = read_db()
    leads = db.get("leads", [])
    db["leads"] = [l for l in leads if not (l.get("id") == lead_id and l.get("clientId", 'default') == client_id)]
    write_db(db)
    return True

def get_settings_json(client_id='default'):
    db = read_db()
    all_settings = db.get("settings", {})
    if "systemPrompt" in all_settings:
        legacy_settings = all_settings
        db["settings"] = { "default": legacy_settings }
        write_db(db)
        all_settings = db["settings"]
    return all_settings.get(client_id, DEFAULT_STATE["settings"])

def save_settings_json(settings, client_id='default'):
    db = read_db()
    all_settings = db.setdefault("settings", {})
    if "systemPrompt" in all_settings:
        legacy_settings = all_settings
        db["settings"] = { "default": legacy_settings }
        all_settings = db["settings"]
    current_client_settings = all_settings.get(client_id, DEFAULT_STATE["settings"])
    all_settings[client_id] = {**current_client_settings, **settings}
    write_db(db)
    return all_settings[client_id]

def get_notifications_json(client_id='default'):
    db = read_db()
    notifications = db.get("notifications", [])
    return [n for n in notifications if n.get("clientId", 'default') == client_id]

def save_notification_json(log, client_id='default'):
    db = read_db()
    notifications = db.setdefault("notifications", [])
    import datetime
    import time
    now_str = datetime.datetime.utcnow().isoformat() + 'Z'
    log["timestamp"] = now_str
    log["id"] = log.get("id") or f"notif-{int(time.time() * 1000)}"
    log["clientId"] = client_id
    notifications.append(log)
    write_db(db)
    return log

# ─────────────────────────────────────────────────────────────
# Public Unified Database API
# ─────────────────────────────────────────────────────────────

def get_leads(client_id='default'):
    if not USE_POSTGRES:
        return get_leads_json(client_id)
        
    query = """
        SELECT id, client_id, name, email, status, booked_meeting, transcript, data
        FROM leads
        WHERE client_id = %s
    """
    rows = execute_query(query, (client_id,), fetch=True)
    leads = []
    for r in rows:
        lead = {
            "id": r[0],
            "clientId": r[1],
            "name": r[2],
            "email": r[3],
            "status": r[4],
            "bookedMeeting": parse_json_field(r[5]),
            "transcript": parse_json_field(r[6]) or []
        }
        extra_data = parse_json_field(r[7]) or {}
        lead.update(extra_data)
        leads.append(lead)
    return leads

def get_lead(lead_id, client_id='default'):
    if not USE_POSTGRES:
        leads = get_leads_json(client_id)
        for l in leads:
            if l.get("id") == lead_id:
                return l
        return None
        
    query = """
        SELECT id, client_id, name, email, status, booked_meeting, transcript, data
        FROM leads
        WHERE id = %s AND client_id = %s
    """
    rows = execute_query(query, (lead_id, client_id), fetch=True)
    if not rows:
        return None
    r = rows[0]
    lead = {
        "id": r[0],
        "clientId": r[1],
        "name": r[2],
        "email": r[3],
        "status": r[4],
        "bookedMeeting": parse_json_field(r[5]),
        "transcript": parse_json_field(r[6]) or []
    }
    extra_data = parse_json_field(r[7]) or {}
    lead.update(extra_data)
    return lead

def save_lead(lead, client_id='default'):
    if not USE_POSTGRES:
        return save_lead_json(lead, client_id)
        
    lid = lead.get("id")
    cid = lead.get("clientId") or client_id
    name = lead.get("name")
    email = lead.get("email")
    status = lead.get("status", "in-progress")
    booked_meeting = lead.get("bookedMeeting")
    transcript = lead.get("transcript", [])
    
    standard_keys = {"id", "clientId", "name", "email", "status", "bookedMeeting", "transcript", "createdAt", "updatedAt"}
    extra_data = {k: v for k, v in lead.items() if k not in standard_keys}
    
    import datetime
    now_str = datetime.datetime.utcnow().isoformat() + 'Z'
    
    existing_query = "SELECT created_at FROM leads WHERE id = %s"
    existing = execute_query(existing_query, (lid,), fetch=True)
    
    query = """
        INSERT INTO leads (
            id, client_id, name, email, status, booked_meeting, transcript, data, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            client_id = EXCLUDED.client_id,
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            status = EXCLUDED.status,
            booked_meeting = EXCLUDED.booked_meeting,
            transcript = EXCLUDED.transcript,
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
    """
    
    if existing:
        created_at_val = existing[0][0]
    else:
        created_at_val = now_str
        lead["createdAt"] = now_str
        
    lead["updatedAt"] = now_str
    
    params = (
        lid,
        cid,
        name,
        email,
        status,
        json.dumps(booked_meeting) if booked_meeting else None,
        json.dumps(transcript),
        json.dumps(extra_data),
        created_at_val,
        now_str
    )
    execute_query(query, params)
    return lead

def delete_lead(lead_id, client_id='default'):
    if not USE_POSTGRES:
        return delete_lead_json(lead_id, client_id)
        
    query = "DELETE FROM leads WHERE id = %s AND client_id = %s"
    execute_query(query, (lead_id, client_id))
    return True

def get_settings(client_id='default'):
    if not USE_POSTGRES:
        return get_settings_json(client_id)
        
    query = """
        SELECT system_prompt, faqs, qualifications, resend_api_key, 
               twilio_sid, twilio_token, twilio_from_number, owner_phone_number, google_calendar
        FROM settings
        WHERE client_id = %s
    """
    rows = execute_query(query, (client_id,), fetch=True)
    if not rows:
        default = DEFAULT_STATE["settings"]
        save_settings(default, client_id)
        return default
        
    row = rows[0]
    return {
        "systemPrompt": row[0],
        "faqs": parse_json_field(row[1]) or [],
        "qualifications": parse_json_field(row[2]) or [],
        "resendApiKey": row[3],
        "twilioSid": row[4],
        "twilioToken": row[5],
        "twilioFromNumber": row[6],
        "ownerPhoneNumber": row[7],
        "googleCalendar": parse_json_field(row[8]) or {}
    }

def save_settings(settings, client_id='default'):
    if not USE_POSTGRES:
        return save_settings_json(settings, client_id)
        
    current = get_settings(client_id)
    merged = {**current, **settings}
    
    query = """
        INSERT INTO settings (
            client_id, system_prompt, faqs, qualifications, resend_api_key, 
            twilio_sid, twilio_token, twilio_from_number, owner_phone_number, google_calendar
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (client_id) DO UPDATE SET
            system_prompt = EXCLUDED.system_prompt,
            faqs = EXCLUDED.faqs,
            qualifications = EXCLUDED.qualifications,
            resend_api_key = EXCLUDED.resend_api_key,
            twilio_sid = EXCLUDED.twilio_sid,
            twilio_token = EXCLUDED.twilio_token,
            twilio_from_number = EXCLUDED.twilio_from_number,
            owner_phone_number = EXCLUDED.owner_phone_number,
            google_calendar = EXCLUDED.google_calendar
    """
    params = (
        client_id,
        merged.get("systemPrompt", ""),
        json.dumps(merged.get("faqs", [])),
        json.dumps(merged.get("qualifications", [])),
        merged.get("resendApiKey", ""),
        merged.get("twilioSid", ""),
        merged.get("twilioToken", ""),
        merged.get("twilioFromNumber", ""),
        merged.get("ownerPhoneNumber", ""),
        json.dumps(merged.get("googleCalendar", {}))
    )
    execute_query(query, params)
    return merged

def get_notifications(client_id='default'):
    if not USE_POSTGRES:
        return get_notifications_json(client_id)
        
    query = """
        SELECT id, client_id, message, timestamp, data
        FROM notifications
        WHERE client_id = %s
        ORDER BY timestamp DESC
    """
    rows = execute_query(query, (client_id,), fetch=True)
    notifs = []
    for r in rows:
        notif = {
            "id": r[0],
            "clientId": r[1],
            "timestamp": r[3].isoformat() if hasattr(r[3], "isoformat") else r[3],
        }
        notif.update(parse_json_field(r[4]) or {})
        notifs.append(notif)
    return notifs

def save_notification(log, client_id='default'):
    if not USE_POSTGRES:
        return save_notification_json(log, client_id)
        
    import datetime
    import time
    now_str = datetime.datetime.utcnow().isoformat() + 'Z'
    
    nid = log.get("id") or f"notif-{int(time.time() * 1000)}"
    log["id"] = nid
    log["timestamp"] = now_str
    log["clientId"] = client_id
    
    message = log.get("details") or log.get("body") or "Notification Log"
    
    standard_keys = {"id", "clientId", "timestamp"}
    extra_data = {k: v for k, v in log.items() if k not in standard_keys}
    
    query = """
        INSERT INTO notifications (id, client_id, message, timestamp, data)
        VALUES (%s, %s, %s, %s, %s)
    """
    execute_query(query, (nid, client_id, message, now_str, json.dumps(extra_data)))
    return log

def clear_notifications(client_id='default'):
    if not USE_POSTGRES:
        db = read_db()
        all_notifs = db.get("notifications", [])
        db["notifications"] = [n for n in all_notifs if n.get("clientId") != client_id]
        write_db(db)
        return True
        
    query = "DELETE FROM notifications WHERE client_id = %s"
    execute_query(query, (client_id,))
    return True

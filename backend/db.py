import os
import json
import tempfile

DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'db.json'))

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
        # Atomic write using a temporary file in the same directory
        db_dir = os.path.dirname(DB_FILE)
        fd, temp_path = tempfile.mkstemp(dir=db_dir, suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        # Replace original file with temporary file
        if os.path.exists(DB_FILE):
            os.replace(temp_path, DB_FILE)
        else:
            os.rename(temp_path, DB_FILE)
        return True
    except Exception as e:
        print('Error writing database:', e)
        return False

def get_leads(client_id='default'):
    db = read_db()
    leads = db.get("leads", [])
    return [l for l in leads if l.get("clientId", 'default') == client_id]

def save_lead(lead, client_id='default'):
    db = read_db()
    leads = db.setdefault("leads", [])
    
    # Set clientId on lead if not present
    if "clientId" not in lead:
        lead["clientId"] = client_id
    elif not lead["clientId"]:
        lead["clientId"] = client_id
        
    # Try to find existing lead
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

def delete_lead(lead_id, client_id='default'):
    db = read_db()
    leads = db.get("leads", [])
    # Only delete if it belongs to this client_id
    db["leads"] = [l for l in leads if not (l.get("id") == lead_id and l.get("clientId", 'default') == client_id)]
    write_db(db)
    return True

def get_settings(client_id='default'):
    db = read_db()
    all_settings = db.get("settings", {})
    # settings structure now stores settings per client_id: { "default": {...}, "client_a": {...} }
    # To support backward compatibility, if settings is not formatted per client_id yet:
    if "systemPrompt" in all_settings:
        # Legacy format: migrate it to default client_id
        legacy_settings = all_settings
        db["settings"] = { "default": legacy_settings }
        write_db(db)
        all_settings = db["settings"]
        
    return all_settings.get(client_id, DEFAULT_STATE["settings"])

def save_settings(settings, client_id='default'):
    db = read_db()
    all_settings = db.setdefault("settings", {})
    if "systemPrompt" in all_settings:
        # Legacy format migration
        legacy_settings = all_settings
        db["settings"] = { "default": legacy_settings }
        all_settings = db["settings"]
        
    current_client_settings = all_settings.get(client_id, DEFAULT_STATE["settings"])
    all_settings[client_id] = {**current_client_settings, **settings}
    write_db(db)
    return all_settings[client_id]

def get_notifications(client_id='default'):
    db = read_db()
    notifications = db.get("notifications", [])
    return [n for n in notifications if n.get("clientId", 'default') == client_id]

def save_notification(log, client_id='default'):
    db = read_db()
    notifications = db.setdefault("notifications", [])
    import datetime
    import time
    now_str = datetime.datetime.utcnow().isoformat() + 'Z'
    log["timestamp"] = now_str
    log["id"] = f"notif-{int(time.time() * 1000)}"
    log["clientId"] = client_id
    notifications.append(log)
    write_db(db)
    return log

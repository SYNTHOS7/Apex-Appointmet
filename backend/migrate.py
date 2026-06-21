import os
import json
import psycopg2
from dotenv import load_dotenv

# Load env variables from root .env.local or .env
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(root_dir, '.env.local')
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv(dotenv_path=os.path.join(root_dir, '.env'))

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
DB_JSON_PATH = os.path.join(root_dir, 'db.json')
if not os.path.exists(DB_JSON_PATH):
    # fallback to backend/db.json if not in root
    DB_JSON_PATH = os.path.join(root_dir, 'backend', 'db.json')

def migrate():
    if not DATABASE_URL:
        print("[Migration] ERROR: DATABASE_URL or SUPABASE_DB_URL environment variable is not set.")
        return

    if not os.path.exists(DB_JSON_PATH):
        print(f"[Migration] ERROR: db.json file not found at: {DB_JSON_PATH}")
        return

    print(f"[Migration] Reading local data from: {DB_JSON_PATH}")
    with open(DB_JSON_PATH, 'r', encoding='utf-8') as f:
        db = json.load(f)

    print("[Migration] Connecting to Supabase Postgres database...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
    except Exception as e:
        print(f"[Migration] ERROR connecting to Postgres: {e}")
        return

    try:
        # 1. Migrate settings
        settings_dict = db.get("settings", {})
        # If settings dict contains keys directly (legacy layout), wrap in 'default'
        if "systemPrompt" in settings_dict:
            settings_dict = {"default": settings_dict}

        for client_id, settings in settings_dict.items():
            print(f"[Migration] Migrating settings for client: {client_id}...")
            gcal = settings.get("googleCalendar", {})
            cur.execute("""
                INSERT INTO settings (
                    client_id, system_prompt, faqs, qualifications, resend_api_key, 
                    twilio_sid, twilio_token, twilio_from_number, owner_phone_number, google_calendar
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            """, (
                client_id,
                settings.get("systemPrompt", ""),
                json.dumps(settings.get("faqs", [])),
                json.dumps(settings.get("qualifications", [])),
                settings.get("resendApiKey", ""),
                settings.get("twilioSid", ""),
                settings.get("twilioToken", ""),
                settings.get("twilioFromNumber", ""),
                settings.get("ownerPhoneNumber", ""),
                json.dumps(gcal)
            ))

        # 2. Migrate leads
        leads = db.get("leads", [])
        print(f"[Migration] Found {len(leads)} leads to migrate...")
        for lead in leads:
            lid = lead.get("id")
            cid = lead.get("clientId") or "default"
            name = lead.get("name")
            email = lead.get("email")
            status = lead.get("status", "in-progress")
            booked_meeting = lead.get("bookedMeeting")
            transcript = lead.get("transcript", [])
            created_at = lead.get("createdAt")
            updated_at = lead.get("updatedAt")

            standard_keys = {"id", "clientId", "name", "email", "status", "bookedMeeting", "transcript", "createdAt", "updatedAt"}
            extra_data = {k: v for k, v in lead.items() if k not in standard_keys}

            cur.execute("""
                INSERT INTO leads (
                    id, client_id, name, email, status, booked_meeting, transcript, data, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    client_id = EXCLUDED.client_id,
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    status = EXCLUDED.status,
                    booked_meeting = EXCLUDED.booked_meeting,
                    transcript = EXCLUDED.transcript,
                    data = EXCLUDED.data,
                    updated_at = EXCLUDED.updated_at
            """, (
                lid,
                cid,
                name,
                email,
                status,
                json.dumps(booked_meeting) if booked_meeting else None,
                json.dumps(transcript),
                json.dumps(extra_data),
                created_at,
                updated_at
            ))

        # 3. Migrate notifications
        notifications = db.get("notifications", [])
        print(f"[Migration] Found {len(notifications)} notifications to migrate...")
        for log in notifications:
            nid = log.get("id")
            cid = log.get("clientId") or "default"
            timestamp = log.get("timestamp")
            message = log.get("details") or log.get("body") or "Notification Log"
            
            standard_keys = {"id", "clientId", "timestamp"}
            extra_data = {k: v for k, v in log.items() if k not in standard_keys}

            cur.execute("""
                INSERT INTO notifications (id, client_id, message, timestamp, data)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, (nid, cid, message, timestamp, json.dumps(extra_data)))

        conn.commit()
        print("[Migration] Success! All database records migrated successfully.")

    except Exception as e:
        conn.rollback()
        print(f"[Migration] ERROR during migration transaction: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    migrate()

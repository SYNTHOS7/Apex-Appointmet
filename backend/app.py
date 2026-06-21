import os
import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load env variables from root .env.local or .env
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(root_dir, '.env.local')
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv(dotenv_path=os.path.join(root_dir, '.env'))

from db import save_lead, get_leads, delete_lead, get_settings, save_settings, get_notifications, save_notification, get_lead, clear_notifications

from gemini import get_ai_response
from calendar_service import get_available_slots, book_appointment

app = Flask(__name__)

# ─────────────────────────────────────────────────────────────
# CORS Configuration: route-specific, NOT blanket wildcard
# ─────────────────────────────────────────────────────────────
# The Vercel domain that hosts the Next.js dashboard
DASHBOARD_ORIGIN = os.environ.get("DASHBOARD_ORIGIN", "http://localhost:3000")

# Public widget endpoints: open CORS (any origin can embed the widget)
CORS(app, resources={
    r"/api/chat":     {"origins": "*"},
    r"/api/calendar": {"origins": "*"},
}, supports_credentials=False)

# Admin/dashboard endpoints: only callable from our own Next.js domain
# We apply CORS manually via after_request for these routes
ADMIN_ROUTES = ["/api/leads", "/api/settings", "/api/notifications"]

@app.after_request
def apply_admin_cors(response):
    """Apply strict CORS headers for admin routes — only our dashboard origin."""
    path = request.path
    for route_prefix in ADMIN_ROUTES:
        if path.startswith(route_prefix):
            response.headers["Access-Control-Allow-Origin"] = DASHBOARD_ORIGIN
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            break
    return response


# ─────────────────────────────────────────────────────────────
# Helper: extract clientId from request (query param or JSON body)
# ─────────────────────────────────────────────────────────────
def get_client_id():
    """Pull clientId from query params (GET/DELETE) or JSON body (POST)."""
    cid = request.args.get("clientId")
    if not cid and request.is_json:
        cid = (request.json or {}).get("clientId")
    return cid or "default"


# ─────────────────────────────────────────────────────────────
# Public Widget Endpoints (CORS: *)
# ─────────────────────────────────────────────────────────────

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json or {}
        chat_id = data.get("chatId")
        message = data.get("message")
        client_id = get_client_id()
        
        if not chat_id or not message:
            return jsonify({"error": "chatId and message are required"}), 400
            
        lead = get_lead(chat_id, client_id)
                
        # Initialize lead if it doesn't exist
        if not lead:
            lead = {
                "id": chat_id,
                "clientId": client_id,
                "name": None,
                "email": None,
                "status": "in-progress",
                "transcript": [],
                "bookedMeeting": None
            }
            # Add dynamic placeholders for active qualifications
            settings_data = get_settings(client_id)
            for q in settings_data.get("qualifications", []):
                lead[q.get("id")] = None
            
        # Append user message
        now_str = datetime.datetime.utcnow().isoformat() + 'Z'
        lead.setdefault("transcript", []).append({
            "role": "user",
            "content": message,
            "timestamp": now_str
        })
        
        # Get response (Gemini or simulated)
        ai_result = get_ai_response(lead["transcript"], lead)
        
        # Update qualifications dynamically
        ext = ai_result.get("extractedInfo", {}) or {}
        settings_data = get_settings(client_id)
        for q in settings_data.get("qualifications", []):
            qid = q.get("id")
            if ext.get(qid) is not None:
                lead[qid] = ext[qid]
                
        if ext.get("name") is not None: lead["name"] = ext["name"]
        if ext.get("email") is not None: lead["email"] = ext["email"]
        
        if ai_result.get("isQualified"):
            lead["status"] = "qualified"
            
        # Append assistant reply
        lead["transcript"].append({
            "role": "assistant",
            "content": ai_result.get("reply", ""),
            "timestamp": datetime.datetime.utcnow().isoformat() + 'Z'
        })
        
        # Save lead to file DB (with clientId tagging)
        save_lead(lead)
        
        # Return ONLY safe fields to the public widget
        return jsonify({
            "reply": ai_result.get("reply", ""),
            "showCalendar": ai_result.get("showCalendar", False),
            "lead": {
                "id": lead.get("id"),
                "name": lead.get("name"),
                "email": lead.get("email"),
                "status": lead.get("status"),
                "bookedMeeting": lead.get("bookedMeeting")
            }
        })
        
    except Exception as e:
        print('[Chat API Route] Error:', e)
        return jsonify({"error": "Internal Server Error"}), 500

@app.route('/api/calendar', methods=['GET'])
def get_slots():
    try:
        # clientId available but not needed for slot generation yet
        slots = get_available_slots()
        # Return ONLY ISO timestamp strings — no internal metadata
        return jsonify({"slots": slots})
    except Exception as e:
        print('[Calendar API GET] Error:', e)
        return jsonify({"error": "Failed to fetch slots"}), 500

@app.route('/api/calendar', methods=['POST'])
def book_slot():
    try:
        data = request.json or {}
        chat_id = data.get("chatId")
        slot = data.get("slot")
        client_id = get_client_id()
        
        if not chat_id or not slot:
            return jsonify({"error": "chatId and slot are required"}), 400
            
        updated_lead = book_appointment(chat_id, slot)
        # Return ONLY safe fields to the public widget
        return jsonify({
            "success": True,
            "lead": {
                "id": updated_lead.get("id"),
                "name": updated_lead.get("name"),
                "bookedMeeting": updated_lead.get("bookedMeeting")
            }
        })
    except Exception as e:
        print('[Calendar API POST] Error:', e)
        return jsonify({"error": str(e) or "Failed to book slot"}), 500


# ─────────────────────────────────────────────────────────────
# Admin Dashboard Endpoints (CORS: DASHBOARD_ORIGIN only)
# ─────────────────────────────────────────────────────────────

@app.route('/api/leads', methods=['GET'])
def get_all_leads():
    try:
        client_id = get_client_id()
        leads_list = get_leads(client_id)
        # Sort by updated time desc
        try:
            leads_list.sort(key=lambda x: x.get("updatedAt", ""), reverse=True)
        except Exception:
            pass
        return jsonify({"leads": leads_list})
    except Exception as e:
        print('[Leads API GET] Error:', e)
        return jsonify({"error": "Failed to fetch leads"}), 500

@app.route('/api/leads', methods=['DELETE'])
def remove_lead():
    try:
        lead_id = request.args.get("id")
        client_id = get_client_id()
        if not lead_id:
            return jsonify({"error": "Lead ID is required"}), 400
            
        delete_lead(lead_id, client_id)
        return jsonify({"success": True})
    except Exception as e:
        print('[Leads API DELETE] Error:', e)
        return jsonify({"error": "Failed to delete lead"}), 500

@app.route('/api/settings', methods=['GET'])
def fetch_settings():
    try:
        client_id = get_client_id()
        settings = get_settings(client_id)
        gcal = settings.get("googleCalendar", {})
        
        sanitized = {
            "systemPrompt": settings.get("systemPrompt", ""),
            "faqs": settings.get("faqs", []),
            "qualifications": settings.get("qualifications", []),
            "resendApiKey": "••••••••••••" if (settings.get("resendApiKey") or os.environ.get("RESEND_API_KEY")) else "",
            "twilioSid": "••••••••••••" if (settings.get("twilioSid") or os.environ.get("TWILIO_ACCOUNT_SID")) else "",
            "twilioToken": "••••••••••••" if (settings.get("twilioToken") or os.environ.get("TWILIO_AUTH_TOKEN")) else "",
            "twilioFromNumber": settings.get("twilioFromNumber") or os.environ.get("TWILIO_FROM_NUMBER") or "",
            "ownerPhoneNumber": settings.get("ownerPhoneNumber") or os.environ.get("OWNER_PHONE_NUMBER") or "",
            "googleCalendar": {
                "clientId": gcal.get("clientId", ""),
                "clientSecret": "••••••••••••" if gcal.get("clientSecret") else "",
                "refreshToken": "••••••••••••" if gcal.get("refreshToken") else "",
                "isEnabled": gcal.get("isEnabled", False),
                "isMockMode": gcal.get("isMockMode", True)
            }
        }
        return jsonify({"settings": sanitized})
    except Exception as e:
        print('[Settings API GET] Error:', e)
        return jsonify({"error": "Failed to fetch settings"}), 500

@app.route('/api/settings', methods=['POST'])
def save_config_settings():
    try:
        new_settings = request.json or {}
        client_id = new_settings.pop("clientId", "default")
        current_settings = get_settings(client_id)
        
        # Preserve keys if masked
        if new_settings.get("resendApiKey") == "••••••••••••":
            new_settings["resendApiKey"] = current_settings.get("resendApiKey", "")
        if new_settings.get("twilioSid") == "••••••••••••":
            new_settings["twilioSid"] = current_settings.get("twilioSid", "")
        if new_settings.get("twilioToken") == "••••••••••••":
            new_settings["twilioToken"] = current_settings.get("twilioToken", "")
            
        updated_cal = new_settings.get("googleCalendar", {})
        current_cal = current_settings.get("googleCalendar", {})
        
        # Preserve keys if masked
        if updated_cal.get("clientSecret") == "••••••••••••":
            updated_cal["clientSecret"] = current_cal.get("clientSecret", "")
        if updated_cal.get("refreshToken") == "••••••••••••":
            updated_cal["refreshToken"] = current_cal.get("refreshToken", "")
            
        new_settings["googleCalendar"] = updated_cal
        
        saved = save_settings(new_settings, client_id)
        gcal = saved.get("googleCalendar", {})
        sanitized = {
            **saved,
            "resendApiKey": "••••••••••••" if (saved.get("resendApiKey") or os.environ.get("RESEND_API_KEY")) else "",
            "twilioSid": "••••••••••••" if (saved.get("twilioSid") or os.environ.get("TWILIO_ACCOUNT_SID")) else "",
            "twilioToken": "••••••••••••" if (saved.get("twilioToken") or os.environ.get("TWILIO_AUTH_TOKEN")) else "",
            "twilioFromNumber": saved.get("twilioFromNumber") or os.environ.get("TWILIO_FROM_NUMBER") or "",
            "ownerPhoneNumber": saved.get("ownerPhoneNumber") or os.environ.get("OWNER_PHONE_NUMBER") or "",
            "googleCalendar": {
                **gcal,
                "clientSecret": "••••••••••••" if gcal.get("clientSecret") else "",
                "refreshToken": "••••••••••••" if gcal.get("refreshToken") else ""
            }
        }
        return jsonify({"success": True, "settings": sanitized})
    except Exception as e:
        print('[Settings API POST] Error:', e)
        return jsonify({"error": "Failed to save settings"}), 500

@app.route('/api/notifications', methods=['GET'])
def get_sent_notifications():
    try:
        client_id = get_client_id()
        notifs = get_notifications(client_id)
        try:
            notifs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        except Exception:
            pass
        return jsonify({"notifications": notifs})
    except Exception as e:
        print('[Notifications API GET] Error:', e)
        return jsonify({"error": "Failed to fetch notifications"}), 500

@app.route('/api/notifications', methods=['DELETE'])
def clear_all_notifications():
    try:
        client_id = get_client_id()
        clear_notifications(client_id)
        return jsonify({"success": True})
    except Exception as e:
        print('[Notifications API DELETE] Error:', e)
        return jsonify({"error": "Failed to clear notifications"}), 500

if __name__ == '__main__':
    # Listen to all addresses on port 5000
    app.run(host='127.0.0.1', port=5000, debug=True)

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

from db import read_db, save_lead, get_leads, delete_lead, get_settings, save_settings
from gemini import get_ai_response
from calendar_service import get_available_slots, book_appointment

app = Flask(__name__)
# Enable CORS for Next.js dev server on port 3000
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json or {}
        chat_id = data.get("chatId")
        message = data.get("message")
        
        if not chat_id or not message:
            return jsonify({"error": "chatId and message are required"}), 400
            
        db = read_db()
        lead = None
        for l in db.get("leads", []):
            if l.get("id") == chat_id:
                lead = l
                break
                
        # Initialize lead if it doesn't exist
        if not lead:
            lead = {
                "id": chat_id,
                "name": None,
                "email": None,
                "status": "in-progress",
                "need": None,
                "budget": None,
                "timeline": None,
                "transcript": [],
                "bookedMeeting": None
            }
            
        # Append user message
        now_str = datetime.datetime.utcnow().isoformat() + 'Z'
        lead.setdefault("transcript", []).append({
            "role": "user",
            "content": message,
            "timestamp": now_str
        })
        
        # Get response (Gemini or simulated)
        ai_result = get_ai_response(lead["transcript"], lead)
        
        # Update qualifications
        ext = ai_result.get("extractedInfo", {})
        if ext.get("need"): lead["need"] = ext["need"]
        if ext.get("budget"): lead["budget"] = ext["budget"]
        if ext.get("timeline"): lead["timeline"] = ext["timeline"]
        if ext.get("name"): lead["name"] = ext["name"]
        if ext.get("email"): lead["email"] = ext["email"]
        
        if ai_result.get("isQualified"):
            lead["status"] = "qualified"
            
        # Append assistant reply
        lead["transcript"].append({
            "role": "assistant",
            "content": ai_result.get("reply", ""),
            "timestamp": datetime.datetime.utcnow().isoformat() + 'Z'
        })
        
        # Save lead to file DB
        save_lead(lead)
        
        return jsonify({
            "reply": ai_result.get("reply", ""),
            "showCalendar": ai_result.get("showCalendar", False),
            "lead": {
                "id": lead.get("id"),
                "name": lead.get("name"),
                "email": lead.get("email"),
                "status": lead.get("status"),
                "need": lead.get("need"),
                "budget": lead.get("budget"),
                "timeline": lead.get("timeline"),
                "bookedMeeting": lead.get("bookedMeeting")
            }
        })
        
    except Exception as e:
        print('[Chat API Route] Error:', e)
        return jsonify({"error": "Internal Server Error"}), 500

@app.route('/api/calendar', methods=['GET'])
def get_slots():
    try:
        slots = get_available_slots()
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
        
        if not chat_id or not slot:
            return jsonify({"error": "chatId and slot are required"}), 400
            
        updated_lead = book_appointment(chat_id, slot)
        return jsonify({"success": True, "lead": updated_lead})
    except Exception as e:
        print('[Calendar API POST] Error:', e)
        return jsonify({"error": str(e) or "Failed to book slot"}), 500

@app.route('/api/leads', methods=['GET'])
def get_all_leads():
    try:
        leads_list = get_leads()
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
        if not lead_id:
            return jsonify({"error": "Lead ID is required"}), 400
            
        delete_lead(lead_id)
        return jsonify({"success": True})
    except Exception as e:
        print('[Leads API DELETE] Error:', e)
        return jsonify({"error": "Failed to delete lead"}), 500

@app.route('/api/settings', methods=['GET'])
def fetch_settings():
    try:
        settings = get_settings()
        gcal = settings.get("googleCalendar", {})
        
        sanitized = {
            "systemPrompt": settings.get("systemPrompt", ""),
            "faqs": settings.get("faqs", []),
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
        current_settings = get_settings()
        
        updated_cal = new_settings.get("googleCalendar", {})
        current_cal = current_settings.get("googleCalendar", {})
        
        # Preserve keys if masked
        if updated_cal.get("clientSecret") == "••••••••••••":
            updated_cal["clientSecret"] = current_cal.get("clientSecret", "")
        if updated_cal.get("refreshToken") == "••••••••••••":
            updated_cal["refreshToken"] = current_cal.get("refreshToken", "")
            
        new_settings["googleCalendar"] = updated_cal
        
        saved = save_settings(new_settings)
        return jsonify({"success": True, "settings": saved})
    except Exception as e:
        print('[Settings API POST] Error:', e)
        return jsonify({"error": "Failed to save settings"}), 500

if __name__ == '__main__':
    # Listen to all addresses on port 5000
    app.run(host='127.0.0.1', port=5000, debug=True)

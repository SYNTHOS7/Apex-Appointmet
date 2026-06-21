import os
import json
import re
import datetime
import requests
from db import get_settings

def compile_system_instruction(settings):
    faqs_text = ""
    for faq in settings.get("faqs", []):
        faqs_text += f"Q: {faq.get('question')}\nA: {faq.get('answer')}\n\n"
        
    active_quals = [q for q in settings.get("qualifications", []) if q.get("enabled", True)]
    
    qual_instructions = ""
    schema_fields = {}
    for q in active_quals:
        qual_instructions += f"   - {q.get('label')} ({q.get('description')})\n"
        schema_fields[q.get("id")] = f"Extracted {q.get('label')} if mentioned (or null)"
        
    schema_fields["name"] = "User's full name if provided (or null)"
    schema_fields["email"] = "User's email address if provided (or null)"
    
    schema_json = {
        "reply": "Your next conversational message to the user.",
        "extractedInfo": schema_fields,
        "isQualified": "boolean (Set to true if ALL required qualification fields above have been successfully extracted and meet the criteria)",
        "showCalendar": "boolean (Set to true if isQualified is true AND you have captured their name and email, and are offering them to book a slot)"
    }
    
    return f"""{settings.get('systemPrompt')}

Here is our knowledge base to answer user questions:
{faqs_text}

You must qualify the lead based on the following specific criteria:
{qual_instructions}

IMPORTANT: You must return a JSON response matching this EXACT schema format:
{json.dumps(schema_json, indent=2)}

Ensure all JSON properties are closed, and do not include markdown backticks around the JSON - return ONLY the raw JSON string."""

def get_simulated_response(transcript, settings, lead):
    messages = transcript or []
    last_user_msg = ""
    if messages:
        # Find the last user message
        for msg in reversed(messages):
            if msg.get("role") == "user":
                last_user_msg = msg.get("content", "").lower()
                break
                
    active_quals = [q for q in settings.get("qualifications", []) if q.get("enabled", True)]
    
    # Initialize extracted info with current lead values
    extracted_info = {}
    for q in active_quals:
        extracted_info[q["id"]] = lead.get(q["id"]) or None
    extracted_info["name"] = lead.get("name")
    extracted_info["email"] = lead.get("email")
    
    # 1. Check FAQs first
    for faq in settings.get("faqs", []):
        q_words = [w for w in faq.get("question", "").lower().split(" ") if len(w) > 3]
        match_count = sum(1 for w in q_words if w in last_user_msg)
        if match_count >= 2 or faq.get("question", "").lower() in last_user_msg:
            return {
                "reply": f"{faq.get('answer')} By the way, regarding your project, do you have any specific requirements or goals?",
                "extractedInfo": extracted_info,
                "isQualified": False,
                "showCalendar": False
            }
            
    # 2. Heuristic state transition
    # Find which qualification is currently being filled
    current_field = None
    for q in active_quals:
        if not extracted_info[q["id"]]:
            current_field = q["id"]
            break
            
    if last_user_msg:
        if current_field:
            if current_field == "budget":
                budget_match = re.search(r'\$?(\d+[\d,kK]*)', last_user_msg)
                if budget_match:
                    extracted_info["budget"] = budget_match.group(0)
                else:
                    extracted_info["budget"] = messages[-1].get("content") if messages else ""
            else:
                extracted_info[current_field] = messages[-1].get("content") if messages else ""
        elif not extracted_info["name"] or not extracted_info["email"]:
            email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', last_user_msg)
            if email_match:
                extracted_info["email"] = email_match.group(0)
                name_part = last_user_msg.replace(email_match.group(0), '')
                name_part = re.sub(r'my name is|i am|this is', '', name_part).strip()
                if len(name_part) > 2:
                    extracted_info["name"] = name_part.capitalize()
                    
            if not extracted_info["name"] and len(last_user_msg) > 2 and '@' not in last_user_msg:
                extracted_info["name"] = messages[-1].get("content") if messages else ""
            if not extracted_info["email"] and '@' in last_user_msg:
                extracted_info["email"] = email_match.group(0) if email_match else last_user_msg

    # Re-evaluate which field is next
    next_field_to_fill = None
    for q in active_quals:
        if not extracted_info[q["id"]]:
            next_field_to_fill = q
            break
            
    is_qualified = (next_field_to_fill is None)
    
    # Formulate response
    reply = ""
    show_calendar = False
    
    if next_field_to_fill:
        if next_field_to_fill["id"] == "need":
            reply = "Hi! I am the assistant for Apex Digital Solutions. To get started, what kind of project are you looking to build?"
        elif next_field_to_fill["id"] == "budget":
            reply = "Got it. What is your estimated budget or price range for this project?"
        elif next_field_to_fill["id"] == "timeline":
            reply = "And what is your target timeline or launch date for the project?"
        else:
            reply = f"Thanks. Could you please share details about: {next_field_to_fill['label']}?"
    elif not extracted_info["name"]:
        reply = "Great! Those details look perfect. We can definitely help you with this project. To schedule a call, what is your full name?"
    elif not extracted_info["email"]:
        reply = f"Thanks, {extracted_info['name']}! What is your email address so we can send the meeting link?"
    else:
        reply = f"Thank you, {extracted_info['name']}. Your details have been qualified! Please select a call time from our scheduler below."
        show_calendar = True
        
    return {
        "reply": reply,
        "extractedInfo": extracted_info,
        "isQualified": is_qualified,
        "showCalendar": show_calendar
    }

def get_ai_response(transcript, lead):
    settings = get_settings()
    api_key = os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        print('[Gemini Service] No API Key found, running in Simulation Mode.')
        return get_simulated_response(transcript, settings, lead)
        
    try:
        system_instruction = compile_system_instruction(settings)
        
        contents = []
        for msg in transcript:
            role = 'model' if msg.get("role") == 'assistant' else 'user'
            contents.append({
                "role": role,
                "parts": [{"text": msg.get("content", "")}]
            })
            
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        
        payload = {
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": system_instruction}]
            },
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2
            }
        }
        
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
        
        if response.status_code != 200:
            raise Exception(f"Gemini API error: {response.status_code} - {response.text}")
            
        data = response.json()
        try:
            responseText = data['candidates'][0]['content']['parts'][0]['text']
        except (KeyError, IndexError):
            raise Exception("Empty response from Gemini API candidates")
            
        parsed = json.loads(responseText.strip())
        return parsed
        
    except Exception as e:
        print('[Gemini Service] Error calling Gemini API:', e)
        return get_simulated_response(transcript, settings, lead)

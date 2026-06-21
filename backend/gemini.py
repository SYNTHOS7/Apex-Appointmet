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
        
    return f"""{settings.get('systemPrompt')}

Here is our knowledge base to answer user questions:
{faqs_text}

IMPORTANT: You must return a JSON response matching this schema:
{{
  "reply": "Your next conversational message to the user.",
  "extractedInfo": {{
    "need": "Summarized need if they mentioned what they want to build (or null)",
    "budget": "Extracted budget/price range if they mentioned it (or null)",
    "timeline": "Extracted launch timeline if they mentioned it (or null)",
    "name": "User's full name if they provided it (or null)",
    "email": "User's email address if they provided it (or null)"
  }},
  "isQualified": false, // Set to true if Need, Budget, and Timeline have all been discussed and meet requirements (budget >= $3000, timeline within 3 months)
  "showCalendar": false // Set to true if isQualified is true AND you have successfully captured their name and email and are prompting them to book a time.
}}

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
                
    extracted_info = {
        "need": lead.get("need"),
        "budget": lead.get("budget"),
        "timeline": lead.get("timeline"),
        "name": lead.get("name"),
        "email": lead.get("email")
    }
    
    # 1. Check FAQs first
    for faq in settings.get("faqs", []):
        q_words = [w for w in faq.get("question", "").lower().split(" ") if len(w) > 3]
        match_count = sum(1 for w in q_words if w in last_user_msg)
        if match_count >= 2 or faq.get("question", "").lower() in last_user_msg:
            return {
                "reply": f"{faq.get('answer')} By the way, to see if we can help with your project, what specific requirements or goals do you have in mind?",
                "extractedInfo": extracted_info,
                "isQualified": False,
                "showCalendar": False
            }
            
    # 2. State transition simulation
    reply = ""
    show_calendar = False
    is_qualified = False
    
    if last_user_msg:
        if not extracted_info["need"]:
            extracted_info["need"] = messages[-1].get("content") if messages else ""
        elif not extracted_info["budget"]:
            budget_match = re.search(r'\$?(\d+[\d,kK]*)', last_user_msg)
            if budget_match:
                extracted_info["budget"] = budget_match.group(0)
            else:
                extracted_info["budget"] = messages[-1].get("content") if messages else ""
        elif not extracted_info["timeline"]:
            extracted_info["timeline"] = messages[-1].get("content") if messages else ""
        elif not extracted_info["name"] or not extracted_info["email"]:
            email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', last_user_msg)
            if email_match:
                extracted_info["email"] = email_match.group(0)
                # Guess name
                name_part = last_user_msg.replace(email_match.group(0), '')
                name_part = re.sub(r'my name is|i am|this is', '', name_part).strip()
                if len(name_part) > 2:
                    extracted_info["name"] = name_part.capitalize()
                    
            if not extracted_info["name"] and len(last_user_msg) > 2 and '@' not in last_user_msg:
                extracted_info["name"] = messages[-1].get("content") if messages else ""
            if not extracted_info["email"] and '@' in last_user_msg:
                extracted_info["email"] = email_match.group(0) if email_match else last_user_msg
                
    if extracted_info["need"] and extracted_info["budget"] and extracted_info["timeline"]:
        is_qualified = True
        
    if not extracted_info["need"]:
        reply = "Hi! I am the assistant for Apex Digital Solutions. I'd love to help you book a meeting with our team. To get started, what kind of project are you looking to build?"
    elif not extracted_info["budget"]:
        reply = "That sounds like an interesting project! To make sure we're a good fit, what is your estimated budget or price range for this project?"
    elif not extracted_info["timeline"]:
        reply = "Got it. And what is your target timeline or launch date for this project?"
    elif not extracted_info["name"]:
        reply = "Excellent, those details look great. We are definitely able to help with this! To get a discovery call scheduled, what is your name?"
    elif not extracted_info["email"]:
        reply = f"Thanks, {extracted_info['name']}! What is your email address so we can send you the calendar invite?"
    else:
        reply = f"Thank you, {extracted_info['name']}. Everything is qualified! Please pick a time from our calendar below to book your discovery call."
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

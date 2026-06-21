import datetime
import requests
import os
from db import get_settings, save_lead, save_notification, get_leads, get_lead

def get_google_access_token(client_id, client_secret, refresh_token):
    try:
        response = requests.post("https://oauth2.googleapis.com/token", data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token"
        })
        if response.status_code != 200:
            raise Exception(f"Failed to refresh token: {response.status_code} - {response.text}")
        return response.json().get("access_token")
    except Exception as e:
        print('[Calendar Service] Error refreshing Google access token:', e)
        raise e

def get_google_busy_slots(access_token, time_min, time_max):
    try:
        response = requests.post(
            "https://www.googleapis.com/calendar/v3/freeBusy",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json={
                "timeMin": time_min,
                "timeMax": time_max,
                "items": [{"id": "primary"}]
            }
        )
        if response.status_code != 200:
            raise Exception(f"Google FreeBusy error: {response.status_code} - {response.text}")
            
        busy_data = response.json().get("calendars", {}).get("primary", {}).get("busy", [])
        
        # Parse busy blocks to timestamp ranges
        busy_ranges = []
        for b in busy_data:
            start_dt = datetime.datetime.fromisoformat(b["start"].replace("Z", "+00:00"))
            end_dt = datetime.datetime.fromisoformat(b["end"].replace("Z", "+00:00"))
            busy_ranges.append({
                "start": start_dt.timestamp(),
                "end": end_dt.timestamp()
            })
        return busy_ranges
    except Exception as e:
        print('[Calendar Service] Error fetching Google busy blocks:', e)
        return []

def generate_base_slots_for_date(date_obj):
    slots = []
    # Skip weekends (Monday is 0, Sunday is 6)
    if date_obj.weekday() >= 5:
        return slots
        
    year = date_obj.year
    month = f"{date_obj.month:02d}"
    day = f"{date_obj.day:02d}"
    
    # Weekday slots (9:00 AM - 5:00 PM, skipping lunch 12:00 PM - 1:00 PM)
    hours = [
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
        '16:00', '16:30'
    ]
    
    for t in hours:
        hour, minute = map(int, t.split(':'))
        slot_dt = datetime.datetime(year, int(month), int(day), hour, minute)
        slots.append(slot_dt)
        
    return slots

def get_available_slots(client_id='default'):
    settings = get_settings(client_id)
    gcal = settings.get("googleCalendar", {})
    
    # Calculate next 7 days starting from tomorrow
    now = datetime.datetime.utcnow()
    start_date = now + datetime.timedelta(days=1)
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    
    end_date = now + datetime.timedelta(days=8)
    end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999)
    
    time_min = start_date.isoformat() + 'Z'
    time_max = end_date.isoformat() + 'Z'
    
    # 1. Generate base business-hours slots
    all_slots = []
    current_date = start_date
    while current_date <= end_date:
        all_slots.extend(generate_base_slots_for_date(current_date))
        current_date += datetime.timedelta(days=1)
        
    # 2. Get local database bookings
    leads = get_leads(client_id)
    local_booked_times = []
    for l in leads:
        bm = l.get("bookedMeeting")
        if bm and bm.get("status") == "booked" and bm.get("dateTime"):
            try:
                # Handle trailing Z or offsets
                clean_time = bm["dateTime"].replace("Z", "+00:00")
                local_dt = datetime.datetime.fromisoformat(clean_time)
                local_booked_times.append(local_dt.timestamp())
            except Exception:
                pass
                
    # 3. Filter busy slots depending on Mode
    client_id = gcal.get("clientId")
    client_secret = gcal.get("clientSecret")
    refresh_token = gcal.get("refreshToken")
    
    if gcal.get("isEnabled") and not gcal.get("isMockMode") and client_id and client_secret and refresh_token:
        print('[Calendar Service] Querying real Google Calendar API...')
        try:
            access_token = get_google_access_token(client_id, client_secret, refresh_token)
            google_busy = get_google_busy_slots(access_token, time_min, time_max)
            
            available = []
            for slot in all_slots:
                slot_ts = slot.timestamp()
                slot_end_ts = slot_ts + 30 * 60  # 30 mins
                
                # Check local DB conflict
                if slot_ts in local_booked_times:
                    continue
                    
                # Check Google Calendar conflict
                is_busy = False
                for b in google_busy:
                    if (slot_ts < b["end"]) and (slot_end_ts > b["start"]):
                        is_busy = True
                        break
                if not is_busy:
                    available.append(slot.isoformat() + 'Z')
            return available
        except Exception as e:
            print('[Calendar Service] Failed to get real slots, falling back to Mock Mode:', e)
            
    # Mock Mode Fallback
    print('[Calendar Service] Returning Mock Calendar slots...')
    available = []
    for slot in all_slots:
        if slot.timestamp() not in local_booked_times:
            available.append(slot.isoformat() + 'Z')
    return available

def book_appointment(lead_id, date_time_iso, client_id='default'):
    lead = get_lead(lead_id, client_id)
            
    if not lead:
        raise Exception(f"Lead with id {lead_id} not found")
        
    meeting_date = datetime.datetime.fromisoformat(date_time_iso.replace("Z", "+00:00"))
    meeting_end = meeting_date + datetime.timedelta(minutes=30)
    
    booked_meeting = {
        "dateTime": date_time_iso,
        "durationMinutes": 30,
        "status": "booked",
        "bookedAt": datetime.datetime.utcnow().isoformat() + 'Z'
    }
    
    lead["bookedMeeting"] = booked_meeting
    lead["status"] = "qualified"
    save_lead(lead, client_id)
    
    gcal = settings.get("googleCalendar", {})
    gcal_client_id = gcal.get("clientId")
    gcal_client_secret = gcal.get("clientSecret")
    gcal_refresh_token = gcal.get("refreshToken")
    
    # Book on Google Calendar if enabled
    if gcal.get("isEnabled") and not gcal.get("isMockMode") and gcal_client_id and gcal_client_secret and gcal_refresh_token:
        try:
            print(f"[Calendar Service] Booking event on Google Calendar for lead {lead.get('name')}...")
            access_token = get_google_access_token(gcal_client_id, gcal_client_secret, gcal_refresh_token)
            
            payload = {
                "summary": f"Discovery Call: {lead.get('name')} <> Apex Digital",
                "description": (
                    f"Apex Digital Discovery Call.\n\n"
                    f"Lead Details:\n"
                    f"- Name: {lead.get('name')}\n"
                    f"- Email: {lead.get('email')}\n"
                    f"- Need: {lead.get('need', 'N/A')}\n"
                    f"- Budget: {lead.get('budget', 'N/A')}\n"
                    f"- Timeline: {lead.get('timeline', 'N/A')}\n\n"
                    f"Scheduled via Apex Booking Manager."
                ),
                "start": {
                    "dateTime": date_time_iso
                },
                "end": {
                    "dateTime": meeting_end.isoformat().replace("+00:00", "Z")
                },
                "attendees": [
                    {"email": lead.get("email"), "displayName": lead.get("name")}
                ]
            }
            
            response = requests.post(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json=payload
            )
            
            if response.status_code != 200:
                raise Exception(f"Google Calendar Event Create error: {response.status_code} - {response.text}")
                
            event_id = response.json().get("id")
            print('[Calendar Service] Successfully booked Google Calendar event ID:', event_id)
            
            lead["bookedMeeting"]["googleEventId"] = event_id
            save_lead(lead, client_id)
        except Exception as e:
            print('[Calendar Service] Failed to create Google Calendar event, but local booking is saved:', e)
            
    # Trigger notifications (email & SMS)
    try:
        meeting_time_formatted = meeting_date.strftime("%A, %B %d at %I:%M %p")
        send_email_confirmation(lead, meeting_time_formatted, settings)
        send_sms_alert(lead, meeting_time_formatted, settings)
    except Exception as e:
        print("[Notifications] Error triggering alerts in book_appointment:", e)
            
    return lead

def get_config_val(settings, key, env_var):
    val = settings.get(key)
    if not val or val == "••••••••••••":
        return os.environ.get(env_var)
    return val

def send_email_confirmation(lead, meeting_date_str, settings):
    resend_key = get_config_val(settings, "resendApiKey", "RESEND_API_KEY")
    lead_email = lead.get("email")
    lead_name = lead.get("name", "there")
    
    subject = "Discovery Call Confirmed - Apex Digital Solutions"
    html_content = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0c0d12; color: #f8fafc; border-radius: 12px; border: 1px solid #fbbf24;">
      <h2 style="color: #f59e0b;">Call Confirmed!</h2>
      <p>Hi {lead_name},</p>
      <p>Your discovery call with Apex Digital Solutions has been successfully scheduled.</p>
      <div style="background-color: rgba(255, 255, 255, 0.05); padding: 16px; border-radius: 8px; margin: 20px 0;">
        <strong>📅 Date & Time:</strong> {meeting_date_str}<br/>
        <strong>⏳ Duration:</strong> 30 Minutes<br/>
        <strong>📍 Location:</strong> Video Call link will be sent shortly
      </div>
      <p>Looking forward to speaking with you!</p>
      <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;"/>
      <p style="font-size: 11px; color: #64748b;">Scheduled automatically by Apex Assistant.</p>
    </div>
    """
    
    if resend_key:
        try:
            response = requests.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "from": "Apex Support <onboarding@resend.dev>",
                    "to": lead_email,
                    "subject": subject,
                    "html": html_content
                }
            )
            if response.status_code in [200, 201]:
                save_notification({
                    "type": "email",
                    "recipient": lead_email,
                    "subject": subject,
                    "status": "delivered",
                    "details": "Sent successfully via Resend API."
                })
                print("[Notifications] Real email sent to:", lead_email)
                return
            else:
                print("[Notifications] Resend API error:", response.status_code, response.text)
                save_notification({
                    "type": "email",
                    "recipient": lead_email,
                    "subject": subject,
                    "status": "failed",
                    "details": f"Resend API error: {response.status_code} - {response.text}"
                })
                return
        except Exception as e:
            print("[Notifications] Failed to send email via Resend:", e)
            
    # Simulated log fallback
    save_notification({
        "type": "email",
        "recipient": lead_email,
        "subject": subject,
        "status": "simulated",
        "details": f"Simulated call confirmation email sent to {lead_email}."
    })
    print("[Notifications] Simulated email logged to:", lead_email)

def send_sms_alert(lead, meeting_date_str, settings):
    sid = get_config_val(settings, "twilioSid", "TWILIO_ACCOUNT_SID")
    token = get_config_val(settings, "twilioToken", "TWILIO_AUTH_TOKEN")
    from_num = get_config_val(settings, "twilioFromNumber", "TWILIO_FROM_NUMBER")
    to_num = get_config_val(settings, "ownerPhoneNumber", "OWNER_PHONE_NUMBER")
    lead_name = lead.get("name", "Anonymous")
    
    body_text = f"Apex Alert: New Lead Qualified! {lead_name} ({lead.get('email')}) has booked a discovery call for {meeting_date_str}."
    
    if sid and token and from_num and to_num:
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
            response = requests.post(
                url,
                auth=(sid, token),
                data={
                    "From": from_num,
                    "To": to_num,
                    "Body": body_text
                }
            )
            if response.status_code in [200, 201]:
                save_notification({
                    "type": "sms",
                    "recipient": to_num,
                    "body": body_text,
                    "status": "delivered",
                    "details": "Sent successfully via Twilio API."
                })
                print("[Notifications] Real SMS alert sent to:", to_num)
                return
            else:
                print("[Notifications] Twilio API error:", response.status_code, response.text)
                save_notification({
                    "type": "sms",
                    "recipient": to_num,
                    "body": body_text,
                    "status": "failed",
                    "details": f"Twilio API error: {response.status_code} - {response.text}"
                })
                return
        except Exception as e:
            print("[Notifications] Failed to send SMS via Twilio:", e)
            
    # Simulated log fallback
    save_notification({
        "type": "sms",
        "recipient": to_num or "Owner (Unconfigured)",
        "body": body_text,
        "status": "simulated",
        "details": f"Simulated SMS alert logged to owner: '{body_text}'"
    })
    print("[Notifications] Simulated SMS logged.")

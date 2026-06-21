import datetime
import requests
from db import get_settings, read_db, save_lead

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

def get_available_slots():
    settings = get_settings()
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
    db = read_db()
    local_booked_times = []
    for l in db.get("leads", []):
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

def book_appointment(lead_id, date_time_iso):
    db = read_db()
    leads = db.get("leads", [])
    lead = None
    for l in leads:
        if l.get("id") == lead_id:
            lead = l
            break
            
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
    save_lead(lead)
    
    settings = get_settings()
    gcal = settings.get("googleCalendar", {})
    client_id = gcal.get("clientId")
    client_secret = gcal.get("clientSecret")
    refresh_token = gcal.get("refreshToken")
    
    # Book on Google Calendar if enabled
    if gcal.get("isEnabled") and not gcal.get("isMockMode") and client_id and client_secret and refresh_token:
        try:
            print(f"[Calendar Service] Booking event on Google Calendar for lead {lead.get('name')}...")
            access_token = get_google_access_token(client_id, client_secret, refresh_token)
            
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
            save_lead(lead)
        except Exception as e:
            print('[Calendar Service] Failed to create Google Calendar event, but local booking is saved:', e)
            
    return lead

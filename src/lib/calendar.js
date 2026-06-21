import { getSettings, readDb, saveLead } from './db.js';

// Exchange Google OAuth Refresh Token for Access Token
async function getGoogleAccessToken(clientId, clientSecret, refreshToken) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to refresh token: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('[Calendar Service] Error refreshing Google access token:', error);
    throw error;
  }
}

// Fetch Google Calendar busy blocks using FreeBusy API
async function getGoogleBusySlots(accessToken, timeMin, timeMax) {
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: 'primary' }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google FreeBusy error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const busy = data.calendars?.primary?.busy || [];
    return busy.map(b => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }));
  } catch (error) {
    console.error('[Calendar Service] Error fetching Google busy blocks:', error);
    return [];
  }
}

// Generate base slots for a given date (weekdays, 9:00 AM - 5:00 PM, skipping 12:00 PM - 1:00 PM)
function generateBaseSlotsForDate(date) {
  const slots = [];
  const day = date.getDay();
  
  // Skip weekends (0 = Sunday, 6 = Saturday)
  if (day === 0 || day === 6) {
    return slots;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayStr = String(date.getDate()).padStart(2, '0');

  // Business hours: 9:00 AM to 5:00 PM (17:00)
  // Lunch break: 12:00 PM to 1:00 PM
  const hours = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30'
  ];

  for (const time of hours) {
    // Construct local ISO-like string: YYYY-MM-DDT[hour]:[min]:00
    // We will parse it in the local timezone of the server or relative to UTC
    const isoString = `${year}-${month}-${dayStr}T${time}:00`;
    const slotDate = new Date(isoString);
    slots.push(slotDate);
  }

  return slots;
}

export async function getAvailableSlots() {
  const settings = getSettings();
  const gcal = settings.googleCalendar;
  
  // Calculate date range: next 7 days starting from tomorrow
  const timeMinDate = new Date();
  timeMinDate.setDate(timeMinDate.getDate() + 1); // Start tomorrow
  timeMinDate.setHours(0, 0, 0, 0);

  const timeMaxDate = new Date();
  timeMaxDate.setDate(timeMaxDate.getDate() + 8); // End in 7 days
  timeMaxDate.setHours(23, 59, 59, 999);

  const timeMin = timeMinDate.toISOString();
  const timeMax = timeMaxDate.toISOString();

  // 1. Generate all possible weekday business-hours slots for the 7-day range
  const allSlots = [];
  const runner = new Date(timeMinDate);
  while (runner <= timeMaxDate) {
    allSlots.push(...generateBaseSlotsForDate(new Date(runner)));
    runner.setDate(runner.getDate() + 1);
  }

  // 2. Fetch already booked slots from our local DB to filter them out in all cases
  const db = readDb();
  const localBookedTimes = (db.leads || [])
    .filter(l => l.bookedMeeting && l.bookedMeeting.status === 'booked')
    .map(l => new Date(l.bookedMeeting.dateTime).getTime());

  // 3. Filter busy slots depending on Mode
  if (gcal.isEnabled && !gcal.isMockMode && gcal.clientId && gcal.clientSecret && gcal.refreshToken) {
    console.log('[Calendar Service] Querying real Google Calendar API...');
    try {
      const accessToken = await getGoogleAccessToken(gcal.clientId, gcal.clientSecret, gcal.refreshToken);
      const googleBusy = await getGoogleBusySlots(accessToken, timeMin, timeMax);

      return allSlots.filter(slot => {
        const slotTime = slot.getTime();
        const slotEnd = slotTime + 30 * 60 * 1000; // 30 minutes duration

        // Check if overlaps with local database bookings
        if (localBookedTimes.includes(slotTime)) return false;

        // Check if overlaps with Google Calendar busy periods
        const isBusyOnGoogle = googleBusy.some(b => {
          // Overlap check: (startA < endB) && (endA > startB)
          return (slotTime < b.end) && (slotEnd > b.start);
        });

        return !isBusyOnGoogle;
      }).map(slot => slot.toISOString());
    } catch (error) {
      console.error('[Calendar Service] Failed to get real calendar slots, falling back to Mock Mode:', error);
    }
  }

  // Fallback / Mock Mode: filter using local database bookings only
  console.log('[Calendar Service] Returning Mock Calendar slots...');
  return allSlots
    .filter(slot => !localBookedTimes.includes(slot.getTime()))
    .map(slot => slot.toISOString());
}

export async function bookAppointment(leadId, dateTimeIso) {
  const db = readDb();
  const lead = db.leads.find(l => l.id === leadId);
  if (!lead) {
    throw new Error(`Lead with id ${leadId} not found`);
  }

  const meetingDate = new Date(dateTimeIso);
  const meetingEnd = new Date(meetingDate.getTime() + 30 * 60 * 1000);

  const bookedMeeting = {
    dateTime: dateTimeIso,
    durationMinutes: 30,
    status: 'booked',
    bookedAt: new Date().toISOString(),
  };

  // Save meeting locally
  lead.bookedMeeting = bookedMeeting;
  lead.status = 'qualified'; // Ensure status is set to qualified if they booked
  saveLead(lead);

  const settings = getSettings();
  const gcal = settings.googleCalendar;

  // Book on Google Calendar if enabled
  if (gcal.isEnabled && !gcal.isMockMode && gcal.clientId && gcal.clientSecret && gcal.refreshToken) {
    try {
      console.log(`[Calendar Service] Booking event on Google Calendar for lead ${lead.name}...`);
      const accessToken = await getGoogleAccessToken(gcal.clientId, gcal.clientSecret, gcal.refreshToken);
      
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: `Discovery Call: ${lead.name} <> Apex Digital`,
          description: `Apex Digital Discovery Call.\n\nLead Details:\n- Name: ${lead.name}\n- Email: ${lead.email}\n- Need: ${lead.need || 'N/A'}\n- Budget: ${lead.budget || 'N/A'}\n- Timeline: ${lead.timeline || 'N/A'}\n\nScheduled via Apex Booking Manager.`,
          start: {
            dateTime: dateTimeIso,
          },
          end: {
            dateTime: meetingEnd.toISOString(),
          },
          attendees: [
            { email: lead.email, displayName: lead.name }
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Calendar Event Create error: ${response.status} - ${errText}`);
      }

      const eventData = await response.json();
      console.log('[Calendar Service] Successfully booked Google Calendar event ID:', eventData.id);
      
      // Store event ID
      lead.bookedMeeting.googleEventId = eventData.id;
      saveLead(lead);
    } catch (error) {
      console.error('[Calendar Service] Failed to create Google Calendar event, but local booking is saved:', error);
    }
  }

  return lead;
}

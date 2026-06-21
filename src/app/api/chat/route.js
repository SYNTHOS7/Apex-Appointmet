import { NextResponse } from 'next/server';
import { readDb, saveLead } from '@/lib/db';
import { getAiResponse } from '@/lib/gemini';

export async function POST(request) {
  try {
    const { chatId, message } = await request.json();

    if (!chatId || !message) {
      return NextResponse.json({ error: 'chatId and message are required' }, { status: 400 });
    }

    const db = readDb();
    let lead = db.leads.find(l => l.id === chatId);

    // Create lead if it doesn't exist yet
    if (!lead) {
      lead = {
        id: chatId,
        name: null,
        email: null,
        status: 'in-progress',
        need: null,
        budget: null,
        timeline: null,
        transcript: [],
        bookedMeeting: null
      };
    }

    // Append user message
    lead.transcript.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Get AI response (Gemini API or simulation fallback)
    const aiResult = await getAiResponse(lead.transcript, lead);

    // Update lead qualifications if extracted
    if (aiResult.extractedInfo) {
      const ext = aiResult.extractedInfo;
      if (ext.need) lead.need = ext.need;
      if (ext.budget) lead.budget = ext.budget;
      if (ext.timeline) lead.timeline = ext.timeline;
      if (ext.name) lead.name = ext.name;
      if (ext.email) lead.email = ext.email;
    }

    // Update qualification status
    if (aiResult.isQualified) {
      lead.status = 'qualified';
    }

    // Append assistant reply
    lead.transcript.push({
      role: 'assistant',
      content: aiResult.reply,
      timestamp: new Date().toISOString()
    });

    // Save lead back to DB
    saveLead(lead);

    return NextResponse.json({
      reply: aiResult.reply,
      showCalendar: aiResult.showCalendar,
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        status: lead.status,
        need: lead.need,
        budget: lead.budget,
        timeline: lead.timeline,
        bookedMeeting: lead.bookedMeeting
      }
    });

  } catch (error) {
    console.error('[Chat API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

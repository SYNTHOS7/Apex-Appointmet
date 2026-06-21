import { NextResponse } from 'next/server';
import { getAvailableSlots, bookAppointment } from '@/lib/calendar';

export async function GET() {
  try {
    const slots = await getAvailableSlots();
    return NextResponse.json({ slots });
  } catch (error) {
    console.error('[Calendar API GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { chatId, slot } = await request.json();

    if (!chatId || !slot) {
      return NextResponse.json({ error: 'chatId and slot are required' }, { status: 400 });
    }

    const updatedLead = await bookAppointment(chatId, slot);
    return NextResponse.json({ success: true, lead: updatedLead });
  } catch (error) {
    console.error('[Calendar API POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to book slot' }, { status: 500 });
  }
}

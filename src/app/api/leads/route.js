import { NextResponse } from 'next/server';
import { getLeads, deleteLead } from '@/lib/db';

export async function GET() {
  try {
    const leads = getLeads();
    // Sort leads by latest updated first
    const sortedLeads = [...leads].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return NextResponse.json({ leads: sortedLeads });
  } catch (error) {
    console.error('[Leads API GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('id');

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
    }

    deleteLead(leadId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Leads API DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }
}

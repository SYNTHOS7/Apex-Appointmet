'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

function FunnelChart({ total, qualified, booked }) {
  if (total === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px', fontSize: '13px' }}>
        No conversation data available yet to build the conversion funnel.
      </div>
    );
  }

  const qualPct = Math.round((qualified / total) * 100);
  const bookPct = Math.round((booked / total) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
      {/* Step 1: Sessions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '110px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Sessions
        </div>
        <div style={{ flex: 1, height: '26px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
          <div style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.2) 0%, rgba(251, 191, 36, 0.2) 100%)',
            borderRight: '2px solid var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '12px',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-primary)'
          }}>
            {total} Conversations initiated (100%)
          </div>
        </div>
      </div>

      {/* Step 2: Qualified */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '110px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Qualified
        </div>
        <div style={{ flex: 1, height: '26px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.max(10, qualPct)}%`,
            height: '100%',
            background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.35) 100%)',
            borderRight: '2px solid var(--status-qualified)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '12px',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
          }}>
            {qualified} Leads qualified ({qualPct}%)
          </div>
        </div>
      </div>

      {/* Step 3: Booked */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '110px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Calls Booked
        </div>
        <div style={{ flex: 1, height: '26px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.max(10, bookPct)}%`,
            height: '100%',
            background: 'linear-gradient(90deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.4) 100%)',
            borderRight: '2px solid var(--accent-secondary)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '12px',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
          }}>
            {booked} Meetings scheduled ({bookPct}%)
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const clientId = 'default';

  async function fetchData() {
    try {
      const [leadsRes, notifsRes] = await Promise.all([
        fetch('/api/leads?clientId=' + encodeURIComponent(clientId)),
        fetch('/api/notifications?clientId=' + encodeURIComponent(clientId))
      ]);

      if (!leadsRes.ok || !notifsRes.ok) throw new Error('Failed to fetch dashboard data');
      
      const leadsData = await leadsRes.json();
      const notifsData = await notifsRes.json();

      setLeads(leadsData.leads || []);
      setNotifications(notifsData.notifications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  // Compute metrics
  const totalLeads = leads.length;
  const qualifiedLeads = leads.filter(l => l.status === 'qualified').length;
  const inProgressLeads = leads.filter(l => l.status === 'in-progress').length;
  const bookedMeetings = leads.filter(l => l.bookedMeeting && l.bookedMeeting.status === 'booked').length;
  const conversionRate = totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;

  // Extract upcoming meetings
  const upcomingMeetings = leads
    .filter(l => l.bookedMeeting && l.bookedMeeting.status === 'booked')
    .map(l => ({
      leadId: l.id,
      name: l.name,
      email: l.email,
      dateTime: l.bookedMeeting.dateTime,
      bookedAt: l.bookedMeeting.bookedAt
    }))
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
    .slice(0, 5);

  const formatMeetingTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeAgo = (isoString) => {
    const diff = new Date() - new Date(isoString);
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(isoString).toLocaleDateString();
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      
      <main className="main-content">
        <div className="content-header animate-fade-in">
          <div>
            <h2>Dashboard</h2>
            <p>Overview of your conversational assistant's activity.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={fetchData}>
              Refresh
            </button>
            <Link href="/settings" className="btn btn-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Configure Assistant
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid-3 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>Total Leads Initiated</span>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-primary)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
            </div>
            <h3 style={{ fontSize: '32px', marginTop: '12px', fontWeight: 700 }}>{loading ? '...' : totalLeads}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {inProgressLeads} currently active in conversation
            </p>
          </div>

          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>Qualification Rate</span>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-qualified)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
            </div>
            <h3 style={{ fontSize: '32px', marginTop: '12px', fontWeight: 700 }}>{loading ? '...' : `${conversionRate}%`}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {qualifiedLeads} of {totalLeads} leads qualified
            </p>
          </div>

          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>Booked Appointments</span>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(251, 191, 36, 0.1)', color: 'var(--accent-secondary)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
            </div>
            <h3 style={{ fontSize: '32px', marginTop: '12px', fontWeight: 700 }}>{loading ? '...' : bookedMeetings}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Synced with your calendar
            </p>
          </div>
        </div>

        {/* Conversion Funnel Section */}
        <div className="glass-card animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Conversion Funnel Analysis</h3>
          <FunnelChart total={totalLeads} qualified={qualifiedLeads} booked={bookedMeetings} />
        </div>

        {/* Dynamic Panels */}
        <div className="grid-2-1 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          
          {/* Recent Leads */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Recent Leads</h3>
              <Link href="/leads" style={{ fontSize: '13px', color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
                View All CRM
              </Link>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading recent leads...</div>
            ) : leads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                No leads captured yet. Embed the chat widget to start capturing leads!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {leads.slice(0, 5).map((lead) => (
                  <div key={lead.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: '1px solid var(--border-glass)'
                  }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 600 }}>
                        {lead.name || 'Anonymous Lead'}
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {lead.email || 'No email collected'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {lead.bookedMeeting ? (
                        <span className="badge badge-booked">meeting booked</span>
                      ) : (
                        <span className={`badge badge-${lead.status}`}>
                          {lead.status === 'in-progress' ? 'chatting' : lead.status}
                        </span>
                      )}
                      <Link href={`/leads?id=${lead.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                        Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar Area: Upcoming Calls + Notification dispatch logs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Upcoming Schedule */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3>Upcoming Calls</h3>
              
              {loading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading schedule...</div>
              ) : upcomingMeetings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  No upcoming meetings scheduled.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {upcomingMeetings.map((mtg, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      paddingBottom: i < upcomingMeetings.length - 1 ? '12px' : '0',
                      borderBottom: i < upcomingMeetings.length - 1 ? '1px solid var(--border-glass)' : 'none'
                    }}>
                      <span style={{ fontSize: '13px', color: 'var(--accent-secondary)', fontWeight: 600 }}>
                        {formatMeetingTime(mtg.dateTime)}
                      </span>
                      <h4 style={{ fontSize: '14px', fontWeight: 600 }}>{mtg.name}</h4>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{mtg.email}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notification logs dispatch history */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3>Notification Alerts Log</h3>
              
              {loading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading logs...</div>
              ) : notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  No notifications triggered yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '250px', overflowY: 'auto' }}>
                  {notifications.slice(0, 5).map((log) => (
                    <div key={log.id} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '10px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.01)',
                      border: '1px solid var(--border-glass)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: log.type === 'email' ? 'var(--accent-secondary)' : 'var(--accent-primary)'
                        }}>
                          {log.type === 'email' ? '✉️ Email Alert' : '📞 SMS Alert'}
                        </span>
                        <span style={{
                          fontSize: '9px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: log.status === 'delivered' ? 'rgba(16, 185, 129, 0.1)' : log.status === 'simulated' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: log.status === 'delivered' ? 'var(--status-qualified)' : log.status === 'simulated' ? 'var(--status-inprogress)' : '#ef4444',
                          border: `1px solid ${log.status === 'delivered' ? 'rgba(16, 185, 129, 0.2)' : log.status === 'simulated' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                        }}>
                          {log.status}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.3' }}>
                        {log.details || log.body}
                      </p>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
                        {formatTimeAgo(log.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}

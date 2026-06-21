'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

function LeadsCRMContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('id');

  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Fetch leads
  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  // Sync selected lead when leads list changes or highlightId changes
  useEffect(() => {
    if (leads.length > 0) {
      if (highlightId) {
        const found = leads.find(l => l.id === highlightId);
        if (found) setSelectedLead(found);
      } else if (!selectedLead) {
        setSelectedLead(leads[0]);
      }
    }
  }, [leads, highlightId]);

  // Delete lead handler
  const handleDeleteLead = async (id) => {
    if (!confirm('Are you sure you want to delete this lead? This will erase all transcripts and details.')) return;
    try {
      const res = await fetch(`/api/leads?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setLeads(prev => prev.filter(l => l.id !== id));
        if (selectedLead?.id === id) {
          setSelectedLead(null);
        }
        // Remove from query params if there
        if (highlightId === id) {
          router.push('/leads');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filter & search logic
  const filteredLeads = leads.filter(lead => {
    const name = lead.name || '';
    const email = lead.email || '';
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase()) || 
                          email.toLowerCase().includes(search.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'booked') return matchesSearch && lead.bookedMeeting !== null;
    return matchesSearch && lead.status === statusFilter;
  });

  const formatTime = (isoString) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      
      <main className="main-content">
        <div className="content-header animate-fade-in">
          <div>
            <h2>Leads CRM</h2>
            <p>Track, qualify, and manage leads captured by the assistant.</p>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="animate-fade-in" style={{
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          alignItems: 'center',
          animationDelay: '0.1s'
        }}>
          <input 
            type="text" 
            placeholder="Search by name or email..." 
            className="form-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: '300px', flex: 1 }}
          />
          <select 
            className="form-select" 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: '180px' }}
          >
            <option value="all">All Leads</option>
            <option value="qualified">Qualified</option>
            <option value="in-progress">In Chat</option>
            <option value="booked">Meeting Booked</option>
          </select>
          <button className="btn btn-secondary" onClick={fetchLeads}>
            Refresh
          </button>
        </div>

        {/* Main Work Area */}
        <div className="grid-2-1 animate-fade-in" style={{ animationDelay: '0.2s', alignItems: 'stretch' }}>
          
          {/* CRM Table / List */}
          <div className="glass-card" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading leads...</div>
            ) : filteredLeads.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No matching leads found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Status</th>
                      <th>Need</th>
                      <th>Timeline</th>
                      <th>Captured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => {
                      const isSelected = selectedLead?.id === lead.id;
                      return (
                        <tr 
                          key={lead.id} 
                          onClick={() => setSelectedLead(lead)}
                          style={{ 
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                            borderLeft: isSelected ? '3px solid var(--accent-primary)' : 'none'
                          }}
                        >
                          <td>
                            <div style={{ fontWeight: 600 }}>{lead.name || 'Anonymous'}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{lead.email || 'No email'}</div>
                          </td>
                          <td>
                            {lead.bookedMeeting ? (
                              <span className="badge badge-booked">booked</span>
                            ) : (
                              <span className={`badge badge-${lead.status}`}>
                                {lead.status === 'in-progress' ? 'chatting' : lead.status}
                              </span>
                            )}
                          </td>
                          <td style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {lead.need || '—'}
                          </td>
                          <td>{lead.timeline || '—'}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {formatTime(lead.updatedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Lead Details Sidebar Panel */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {selectedLead ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-glass)', paddingBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '20px', fontWeight: 700 }}>{selectedLead.name || 'Anonymous Lead'}</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      ID: {selectedLead.id.slice(0, 8)}... | Captured: {formatTime(selectedLead.createdAt)}
                    </p>
                  </div>
                  <button className="btn btn-danger" onClick={() => handleDeleteLead(selectedLead.id)} style={{ padding: '6px 10px', fontSize: '12px' }}>
                    Delete
                  </button>
                </div>

                {/* Qualification Metrics */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    Qualification Data
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Need</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{selectedLead.need || 'Collecting...'}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Budget</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{selectedLead.budget || 'Collecting...'}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Timeline</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{selectedLead.timeline || 'Collecting...'}</div>
                    </div>
                  </div>
                </div>

                {/* Booked Meeting info */}
                {selectedLead.bookedMeeting && (
                  <div style={{ background: 'var(--status-booked-bg)', border: '1px solid rgba(6,182,212,0.3)', padding: '16px', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-booked)', fontWeight: 600, fontSize: '14px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      Meeting Scheduled
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '8px', color: 'var(--text-primary)' }}>
                      {formatTime(selectedLead.bookedMeeting.dateTime)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Duration: {selectedLead.bookedMeeting.durationMinutes} mins
                    </div>
                    {selectedLead.bookedMeeting.googleEventId && (
                      <div style={{ fontSize: '11px', color: 'var(--status-booked)', marginTop: '8px', fontStyle: 'italic' }}>
                        ✓ Synced with Google Calendar
                      </div>
                    )}
                  </div>
                )}

                {/* Chat Transcript */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: '300px' }}>
                  <h4 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    Chat Transcript
                  </h4>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                    padding: '12px',
                    border: '1px solid var(--border-glass)'
                  }}>
                    {selectedLead.transcript && selectedLead.transcript.length > 0 ? (
                      selectedLead.transcript.map((msg, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
                        }}>
                          <div style={{
                            background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: msg.role === 'user' ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid var(--border-glass)',
                            padding: '10px 14px',
                            borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                            maxWidth: '90%',
                            fontSize: '13px',
                            lineHeight: '1.4'
                          }}>
                            {msg.content}
                          </div>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '3px', padding: '0 4px' }}>
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        No conversation transcript found.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', margin: 'auto' }}>
                Select a lead from the list to view transcripts and qualification details.
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

export default function LeadsCRM() {
  return (
    <Suspense fallback={
      <div className="dashboard-layout">
        <Sidebar />
        <main className="main-content">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            Loading...
          </div>
        </main>
      </div>
    }>
      <LeadsCRMContent />
    </Suspense>
  );
}

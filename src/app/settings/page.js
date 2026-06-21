'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('agent');
  const [settings, setSettings] = useState({
    systemPrompt: '',
    faqs: [],
    qualifications: [],
    resendApiKey: '',
    twilioSid: '',
    twilioToken: '',
    twilioFromNumber: '',
    ownerPhoneNumber: '',
    googleCalendar: {
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      isEnabled: false,
      isMockMode: true,
    }
  });

  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });
  const [newQual, setNewQual] = useState({ id: '', label: '', description: '', enabled: true });
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Fetch settings on mount
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSettings(data.settings);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  // Fetch notifications log when logs tab becomes active
  useEffect(() => {
    if (activeTab === 'logs') {
      fetchNotifications();
    }
  }, [activeTab]);

  const fetchNotifications = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleClearNotifications = async () => {
    if (!confirm('Are you sure you want to clear all notification logs?')) return;
    try {
      const res = await fetch('/api/notifications', { method: 'DELETE' });
      if (res.ok) {
        setNotifications([]);
      }
    } catch (err) {
      console.error('Error clearing notifications:', err);
    }
  };

  const handleSaveSettings = async (updatedSettings = settings) => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSettings),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setSaveMessage({ type: 'error', text: 'Failed to save settings.' });
      }
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Error saving settings.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // FAQ handlers
  const handleAddFaq = () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) return;

    const faqItem = {
      id: `faq-${Date.now()}`,
      question: newFaq.question.trim(),
      answer: newFaq.answer.trim(),
    };

    const updated = {
      ...settings,
      faqs: [...(settings.faqs || []), faqItem],
    };

    setSettings(updated);
    setNewFaq({ question: '', answer: '' });
    handleSaveSettings(updated);
  };

  const handleDeleteFaq = (id) => {
    const updated = {
      ...settings,
      faqs: (settings.faqs || []).filter(f => f.id !== id),
    };
    setSettings(updated);
    handleSaveSettings(updated);
  };

  // Qualifications / Rules handlers
  const handleAddQual = () => {
    const rawId = newQual.id.trim().toLowerCase();
    const idSafe = rawId.replace(/[^a-z0-9-_]/g, '');
    
    if (!idSafe || !newQual.label.trim() || !newQual.description.trim()) {
      alert('Please fill out all fields. The Key must be alphanumeric (e.g. company_size).');
      return;
    }

    // Check for duplicates
    if ((settings.qualifications || []).some(q => q.id === idSafe)) {
      alert(`A qualification rule with key "${idSafe}" already exists.`);
      return;
    }

    const newQualItem = {
      id: idSafe,
      label: newQual.label.trim(),
      description: newQual.description.trim(),
      enabled: true
    };

    const updated = {
      ...settings,
      qualifications: [...(settings.qualifications || []), newQualItem]
    };

    setSettings(updated);
    setNewQual({ id: '', label: '', description: '', enabled: true });
    handleSaveSettings(updated);
  };

  const handleDeleteQual = (id) => {
    if (!confirm(`Are you sure you want to delete the qualification "${id}"? Existing leads will keep their values, but the AI won't ask for this criteria anymore.`)) return;
    const updated = {
      ...settings,
      qualifications: (settings.qualifications || []).filter(q => q.id !== id)
    };
    setSettings(updated);
    handleSaveSettings(updated);
  };

  const handleToggleQual = (id) => {
    const updatedQuals = (settings.qualifications || []).map(q => {
      if (q.id === id) {
        return { ...q, enabled: !q.enabled };
      }
      return q;
    });

    const updated = {
      ...settings,
      qualifications: updatedQuals
    };
    setSettings(updated);
    handleSaveSettings(updated);
  };

  // Embed script string calculation
  const embedCode = `<!-- AI Appointment Setter Widget -->
<script 
  src="${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/widget.js"
  id="ai-appointment-setter"
></script>
<!-- End AI Appointment Setter Widget -->`;

  return (
    <div className="dashboard-layout">
      <Sidebar />
      
      <main className="main-content">
        <div className="content-header animate-fade-in">
          <div>
            <h2>Settings</h2>
            <p>Customize system behavior, qualification checklist rules, FAQ knowledge base, and dispatch channels.</p>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading settings...</div>
        ) : (
          <div className="grid-2-1 animate-fade-in" style={{ animationDelay: '0.1s', alignItems: 'flex-start' }}>
            
            {/* Configuration Panels */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Tab Navigation */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-glass)',
                paddingBottom: '12px',
                gap: '20px',
                overflowX: 'auto'
              }}>
                {[
                  { id: 'agent', label: 'AI Prompt' },
                  { id: 'rules', label: 'Qualification Rules' },
                  { id: 'faq', label: 'Knowledge Base' },
                  { id: 'integrations', label: 'Integrations & API' },
                  { id: 'logs', label: 'Notification Logs' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      position: 'relative',
                      padding: '4px 0',
                      whiteSpace: 'nowrap',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <span style={{
                        position: 'absolute',
                        bottom: '-13px',
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: 'var(--accent-primary)',
                      }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Success/Error Alerts */}
              {saveMessage && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  background: saveMessage.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${saveMessage.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  color: saveMessage.type === 'success' ? 'var(--status-qualified)' : '#ef4444'
                }}>
                  {saveMessage.text}
                </div>
              )}

              {/* Tab 1: AI Agent Prompt Config */}
              {activeTab === 'agent' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="form-group">
                    <label className="form-label">System Qualification Instructions</label>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      These instructions guide the Gemini model's conversation behavior. Tell it how to act, when to ask questions, and how to verify information.
                    </p>
                    <textarea
                      className="form-input"
                      style={{ minHeight: '300px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5' }}
                      value={settings.systemPrompt}
                      onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
                    />
                  </div>
                  <button className="btn btn-primary" onClick={() => handleSaveSettings()} disabled={saving} style={{ alignSelf: 'flex-start' }}>
                    {saving ? 'Saving...' : 'Save Agent Instructions'}
                  </button>
                </div>
              )}

              {/* Tab 2: Qualification Rules CRM Table */}
              {activeTab === 'rules' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Add Qualification Rule Form */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-secondary)' }}>Add Qualification Criteria</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Unique Key (alphanumeric)</label>
                        <input
                          type="text"
                          placeholder="e.g. company_size"
                          className="form-input"
                          value={newQual.id}
                          onChange={(e) => setNewQual({ ...newQual, id: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Display Label</label>
                        <input
                          type="text"
                          placeholder="e.g. Company Size"
                          className="form-input"
                          value={newQual.label}
                          onChange={(e) => setNewQual({ ...newQual, label: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>AI Guideline Description</label>
                      <textarea
                        placeholder="Tell the AI what qualifies as a match (e.g. Do they have at least 10 active team members?)"
                        className="form-input"
                        style={{ minHeight: '60px' }}
                        value={newQual.description}
                        onChange={(e) => setNewQual({ ...newQual, description: e.target.value })}
                      />
                    </div>
                    <button className="btn btn-secondary" onClick={handleAddQual} style={{ alignSelf: 'flex-end', fontSize: '13px' }}>
                      Add Rule
                    </button>
                  </div>

                  {/* Active Qualifications List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Active Qualification checklist</h4>
                    
                    <div className="custom-table-container">
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '12px 16px', width: '80px' }}>Active</th>
                            <th style={{ padding: '12px 16px', width: '120px' }}>Key</th>
                            <th style={{ padding: '12px 16px', width: '150px' }}>Label</th>
                            <th style={{ padding: '12px 16px' }}>AI Extraction Rule</th>
                            <th style={{ padding: '12px 16px', width: '80px', textAlign: 'center' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(settings.qualifications || []).length === 0 ? (
                            <tr>
                              <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                No qualification criteria setup. The AI will qualify leads directly without custom checks.
                              </td>
                            </tr>
                          ) : (
                            (settings.qualifications || []).map((qual) => (
                              <tr key={qual.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                <td style={{ padding: '12px 16px' }}>
                                  <input
                                    type="checkbox"
                                    checked={qual.enabled}
                                    onChange={() => handleToggleQual(qual.id)}
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                </td>
                                <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--accent-secondary)' }}>
                                  {qual.id}
                                </td>
                                <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                                  {qual.label}
                                </td>
                                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                                  {qual.description}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                  <button 
                                    className="btn btn-danger" 
                                    onClick={() => handleDeleteQual(qual.id)}
                                    style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: FAQ Knowledge Base */}
              {activeTab === 'faq' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Add FAQ form */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-secondary)' }}>Add New FAQ Topic</h4>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <input
                        type="text"
                        placeholder="User Question (e.g. Do you support Shopify?)"
                        className="form-input"
                        value={newFaq.question}
                        onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <textarea
                        placeholder="AI Answer (e.g. Yes, we design custom Shopify storefronts and integrations.)"
                        className="form-input"
                        style={{ minHeight: '80px' }}
                        value={newFaq.answer}
                        onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                      />
                    </div>
                    <button className="btn btn-secondary" onClick={handleAddFaq} style={{ alignSelf: 'flex-end', fontSize: '13px' }}>
                      Add Topic
                    </button>
                  </div>

                  {/* FAQ List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Custom Knowledge base ({settings.faqs.length} topics)</h4>
                    {settings.faqs.length === 0 ? (
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '20px 0' }}>No FAQs added. Add some above to help the AI answer business-specific queries!</p>
                    ) : (
                      settings.faqs.map((faq) => (
                        <div key={faq.id} style={{
                          padding: '16px',
                          borderRadius: '10px',
                          background: 'rgba(0,0,0,0.15)',
                          border: '1px solid var(--border-glass)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '16px'
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Q: {faq.question}</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: '1.4' }}>A: {faq.answer}</div>
                          </div>
                          <button className="btn btn-danger" onClick={() => handleDeleteFaq(faq.id)} style={{ padding: '6px 10px', fontSize: '12px', alignSelf: 'flex-start' }}>
                            Delete
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tab 4: Integrations (Calendar, Resend API, Twilio SMS) */}
              {activeTab === 'integrations' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Google Calendar Section */}
                  <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent-secondary)', marginBottom: '12px' }}>Google Calendar Scheduler</h4>
                    
                    {/* Mock Toggle */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px',
                      borderRadius: '10px',
                      background: 'rgba(245, 158, 11, 0.03)',
                      border: '1px solid var(--border-glass-glow)',
                      marginBottom: '16px'
                    }}>
                      <div>
                        <h5 style={{ fontSize: '14px', fontWeight: 600 }}>Enable Mock Calendar Mode</h5>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Simulates slots checking and bookings instantly without calling Google API. Keep enabled for easy testing.
                        </p>
                      </div>
                      <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                        <input 
                          type="checkbox" 
                          checked={settings.googleCalendar.isMockMode} 
                          onChange={(e) => {
                            const updated = {
                              ...settings,
                              googleCalendar: {
                                ...settings.googleCalendar,
                                isMockMode: e.target.checked
                              }
                            };
                            setSettings(updated);
                            handleSaveSettings(updated);
                          }}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: settings.googleCalendar.isMockMode ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                          borderRadius: '34px',
                          transition: '.3s'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '""',
                            height: '18px', width: '18px',
                            left: settings.googleCalendar.isMockMode ? '26px' : '6px',
                            bottom: '4px',
                            backgroundColor: 'white',
                            borderRadius: '50%',
                            transition: '.3s'
                          }} />
                        </span>
                      </label>
                    </div>

                    {/* Google OAuth Credentials */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: settings.googleCalendar.isMockMode ? 0.5 : 1, transition: '0.3s' }}>
                      <div className="form-group">
                        <label className="form-label">Client ID</label>
                        <input
                          type="text"
                          disabled={settings.googleCalendar.isMockMode}
                          className="form-input"
                          value={settings.googleCalendar.clientId}
                          onChange={(e) => setSettings({
                            ...settings,
                            googleCalendar: { ...settings.googleCalendar, clientId: e.target.value }
                          })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Client Secret</label>
                        <input
                          type="password"
                          disabled={settings.googleCalendar.isMockMode}
                          className="form-input"
                          value={settings.googleCalendar.clientSecret}
                          onChange={(e) => setSettings({
                            ...settings,
                            googleCalendar: { ...settings.googleCalendar, clientSecret: e.target.value }
                          })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">OAuth Refresh Token</label>
                        <input
                          type="password"
                          disabled={settings.googleCalendar.isMockMode}
                          className="form-input"
                          value={settings.googleCalendar.refreshToken}
                          onChange={(e) => setSettings({
                            ...settings,
                            googleCalendar: { ...settings.googleCalendar, refreshToken: e.target.value }
                          })}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input 
                          type="checkbox" 
                          disabled={settings.googleCalendar.isMockMode}
                          id="enable-gcal"
                          checked={settings.googleCalendar.isEnabled} 
                          onChange={(e) => setSettings({
                            ...settings,
                            googleCalendar: { ...settings.googleCalendar, isEnabled: e.target.checked }
                          })}
                        />
                        <label htmlFor="enable-gcal" style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          Activate real Google Calendar integration sync
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Resend Email Section */}
                  <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent-secondary)', marginBottom: '12px' }}>Email Alerts (Resend)</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      Sends automated email confirmations to leads when they book an appointment.
                    </p>
                    <div className="form-group">
                      <label className="form-label">Resend API Key</label>
                      <input
                        type="password"
                        placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                        className="form-input"
                        value={settings.resendApiKey}
                        onChange={(e) => setSettings({ ...settings, resendApiKey: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Twilio SMS Section */}
                  <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent-secondary)', marginBottom: '12px' }}>SMS Alerts (Twilio)</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      Dispatches immediate SMS messages to the business owner when a lead qualifies and books a time slot.
                    </p>
                    <div className="form-group">
                      <label className="form-label">Twilio Account SID</label>
                      <input
                        type="password"
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="form-input"
                        value={settings.twilioSid}
                        onChange={(e) => setSettings({ ...settings, twilioSid: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Twilio Auth Token</label>
                      <input
                        type="password"
                        placeholder="Auth Token"
                        className="form-input"
                        value={settings.twilioToken}
                        onChange={(e) => setSettings({ ...settings, twilioToken: e.target.value })}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Twilio From Number</label>
                        <input
                          type="text"
                          placeholder="+1XXXXXXXXXX"
                          className="form-input"
                          value={settings.twilioFromNumber}
                          onChange={(e) => setSettings({ ...settings, twilioFromNumber: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Owner Phone Number</label>
                        <input
                          type="text"
                          placeholder="+1XXXXXXXXXX"
                          className="form-input"
                          value={settings.ownerPhoneNumber}
                          onChange={(e) => setSettings({ ...settings, ownerPhoneNumber: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <button className="btn btn-primary" onClick={() => handleSaveSettings()} disabled={saving} style={{ alignSelf: 'flex-start' }}>
                    {saving ? 'Saving...' : 'Save Integrations Settings'}
                  </button>
                </div>
              )}

              {/* Tab 5: Dispatched Notification Logs */}
              {activeTab === 'logs' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Sent Dispatch History</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Log of confirmations and notifications processed by the server.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-secondary" onClick={fetchNotifications} disabled={logsLoading} style={{ padding: '6px 12px', fontSize: '12px' }}>
                        {logsLoading ? 'Loading...' : 'Refresh Logs'}
                      </button>
                      <button className="btn btn-danger" onClick={handleClearNotifications} disabled={notifications.length === 0} style={{ padding: '6px 12px', fontSize: '12px' }}>
                        Clear Logs
                      </button>
                    </div>
                  </div>

                  <div className="custom-table-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.02)' }}>
                          <th style={{ padding: '12px 16px', width: '180px' }}>Timestamp</th>
                          <th style={{ padding: '12px 16px', width: '80px' }}>Channel</th>
                          <th style={{ padding: '12px 16px', width: '150px' }}>Recipient</th>
                          <th style={{ padding: '12px 16px', width: '100px' }}>Status</th>
                          <th style={{ padding: '12px 16px' }}>Details / Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logsLoading ? (
                          <tr>
                            <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                              Loading dispatch logs...
                            </td>
                          </tr>
                        ) : notifications.length === 0 ? (
                          <tr>
                            <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                              No alerts logged yet. Logs appear here when a qualified lead books a slot.
                            </td>
                          </tr>
                        ) : (
                          notifications.map((notif) => (
                            <tr key={notif.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                {new Date(notif.timestamp).toLocaleString()}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  background: notif.type === 'email' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                  color: notif.type === 'email' ? 'var(--accent-secondary)' : 'var(--accent-primary)',
                                  border: `1px solid ${notif.type === 'email' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
                                }}>
                                  {notif.type.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                                {notif.recipient}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <span className={`badge ${
                                  notif.status === 'delivered' ? 'badge-qualified' : 
                                  notif.status === 'simulated' ? 'badge-in-progress' : 
                                  'badge-booked'
                                }`} style={{
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  backgroundColor: notif.status === 'failed' ? 'rgba(239, 68, 68, 0.1)' : undefined,
                                  color: notif.status === 'failed' ? '#ef4444' : undefined,
                                  borderColor: notif.status === 'failed' ? 'rgba(239, 68, 68, 0.3)' : undefined
                                }}>
                                  {notif.status}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.4' }}>
                                {notif.type === 'email' ? (
                                  <div>
                                    <strong>Subject:</strong> {notif.subject} <br/>
                                    <span style={{ opacity: 0.85 }}>{notif.details}</span>
                                  </div>
                                ) : (
                                  <div>
                                    <strong>Body:</strong> {notif.body} <br/>
                                    <span style={{ opacity: 0.85 }}>{notif.details}</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Widget Embed Sidebar Panel */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Embed Chat Widget</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Copy the code snippet below and paste it before the closing <code>&lt;/body&gt;</code> tag on any website to load the AI Appointment Setter.
              </p>
              
              <div style={{ position: 'relative' }}>
                <pre style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: 'var(--text-primary)',
                  overflowX: 'auto',
                  border: '1px solid var(--border-glass)',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}>
                  {embedCode}
                </pre>
              </div>

              <div style={{
                background: 'rgba(245, 158, 11, 0.05)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: '1.4',
                border: '1px solid rgba(245, 158, 11, 0.15)'
              }}>
                <strong>💡 Quick Tip:</strong> Want to test it locally right now? Open <a href="/widget" target="_blank" style={{ color: 'var(--accent-secondary)', textDecoration: 'underline' }}>/widget</a> in your browser to chat with the bot in fullscreen simulation.
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

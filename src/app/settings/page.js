'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('agent');
  const [settings, setSettings] = useState({
    systemPrompt: '',
    faqs: [],
    googleCalendar: {
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      isEnabled: false,
      isMockMode: true,
    }
  });

  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Fetch settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSettings(data.settings);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

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
      faqs: [...settings.faqs, faqItem],
    };

    setSettings(updated);
    setNewFaq({ question: '', answer: '' });
    handleSaveSettings(updated);
  };

  const handleDeleteFaq = (id) => {
    const updated = {
      ...settings,
      faqs: settings.faqs.filter(f => f.id !== id),
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
            <p>Customize your AI behavior, custom knowledge base, and calendar sync.</p>
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
                gap: '24px'
              }}>
                {['agent', 'faq', 'calendar'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: '15px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      position: 'relative',
                      padding: '4px 0',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}
                  >
                    {tab === 'agent' ? 'AI Agent' : tab === 'faq' ? 'Knowledge Base' : 'Calendar Sync'}
                    {activeTab === tab && (
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

              {/* Tab 1: AI Agent Config */}
              {activeTab === 'agent' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="form-group">
                    <label className="form-label">System Qualification Instructions</label>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      These instructions direct the AI's conversation behavior. Tell it how to act, what information to extract (budget, need, timeline), and when to qualify.
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

              {/* Tab 2: FAQ Knowledge Base */}
              {activeTab === 'faq' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Add FAQ form */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Add New FAQ Topic</h4>
                    <div className="form-group" style={{ marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="User Question (e.g. Do you support Shopify?)"
                        className="form-input"
                        value={newFaq.question}
                        onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '10px' }}>
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
                          background: 'rgba(0,0,0,0.1)',
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

              {/* Tab 3: Calendar Integration */}
              {activeTab === 'calendar' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Mock Toggle */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    borderRadius: '10px',
                    background: 'rgba(99, 102, 241, 0.05)',
                    border: '1px solid var(--border-glass-glow)'
                  }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 600 }}>Enable Mock Calendar Scheduler</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Simulates Google Calendar slot checking and local booking. Keep enabled to test features instantly.
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

                  {/* Google OAuth Config Fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: settings.googleCalendar.isMockMode ? 0.5 : 1, transition: '0.3s' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 600 }}>Google Calendar API Credentials (OAuth 2.0)</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Disable Mock Mode above to require real sync. Set up your Google Cloud Console project, enable Google Calendar API, configure redirect URI to <code>http://localhost:3000/api/calendar/callback</code>, and insert credentials:
                    </p>
                    
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
                      <label className="form-label">Google OAuth Refresh Token</label>
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
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <input 
                        type="checkbox" 
                        disabled={settings.googleCalendar.isMockMode}
                        id="enable-gcal-checkbox"
                        checked={settings.googleCalendar.isEnabled} 
                        onChange={(e) => setSettings({
                          ...settings,
                          googleCalendar: { ...settings.googleCalendar, isEnabled: e.target.checked }
                        })}
                      />
                      <label htmlFor="enable-gcal-checkbox" style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        Activate Real Sync Integration
                      </label>
                    </div>
                  </div>
                  
                  <button 
                    className="btn btn-primary" 
                    onClick={() => handleSaveSettings()} 
                    disabled={saving || (settings.googleCalendar.isMockMode && false)} 
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {saving ? 'Saving...' : 'Save Calendar Settings'}
                  </button>
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
                background: 'rgba(99, 102, 241, 0.08)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: '1.4',
                border: '1px solid rgba(99, 102, 241, 0.2)'
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

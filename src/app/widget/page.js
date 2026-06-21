'use client';

import { useState, useEffect, useRef } from 'react';

export default function WidgetPage() {
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarSlots, setCalendarSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedMeeting, setBookedMeeting] = useState(null);
  const [leadInfo, setLeadInfo] = useState(null);

  const messagesEndRef = useRef(null);

  // Initialize Chat ID
  useEffect(() => {
    let id = localStorage.getItem('ai_appointment_setter_chat_id');
    if (!id) {
      id = 'chat_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('ai_appointment_setter_chat_id', id);
    }
    setChatId(id);
  }, []);

  // Fetch conversation history or send intro on load
  useEffect(() => {
    if (!chatId) return;

    async function loadChat() {
      try {
        const res = await fetch('/api/leads');
        if (res.ok) {
          const data = await res.json();
          const existingLead = data.leads.find(l => l.id === chatId);
          
          if (existingLead && existingLead.transcript.length > 0) {
            setMessages(existingLead.transcript);
            setLeadInfo(existingLead);
            if (existingLead.bookedMeeting) {
              setBookedMeeting(existingLead.bookedMeeting);
            }
            // Check if last message was qualified and ready to book
            const lastMsg = existingLead.transcript[existingLead.transcript.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && existingLead.status === 'qualified' && !existingLead.bookedMeeting) {
              setShowCalendar(true);
              fetchSlots();
            }
          } else {
            // First time introduction message
            sendSystemIntro();
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadChat();
  }, [chatId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showCalendar]);

  const sendSystemIntro = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: 'hi' })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages([
          { role: 'assistant', content: data.reply, timestamp: new Date().toISOString() }
        ]);
        setLeadInfo(data.lead);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading || bookedMeeting) return;

    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userText, timestamp: new Date().toISOString() }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: userText })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply, timestamp: new Date().toISOString() }]);
        setLeadInfo(data.lead);
        
        if (data.showCalendar && !bookedMeeting) {
          setShowCalendar(true);
          fetchSlots();
        } else {
          setShowCalendar(false);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch calendar slots
  const fetchSlots = async () => {
    try {
      const res = await fetch('/api/calendar');
      if (res.ok) {
        const data = await res.json();
        setCalendarSlots(data.slots || []);
        
        // Pick first available date automatically
        if (data.slots && data.slots.length > 0) {
          const firstSlotDate = new Date(data.slots[0]).toDateString();
          setSelectedDate(firstSlotDate);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Group slots by date
  const slotsByDate = {};
  calendarSlots.forEach(slot => {
    const d = new Date(slot);
    const dateStr = d.toDateString();
    if (!slotsByDate[dateStr]) {
      slotsByDate[dateStr] = [];
    }
    slotsByDate[dateStr].push(slot);
  });

  const uniqueDates = Object.keys(slotsByDate);

  const handleBookMeeting = async () => {
    if (!selectedSlot || bookingLoading) return;
    setBookingLoading(true);

    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, slot: selectedSlot })
      });

      if (res.ok) {
        const data = await res.json();
        setBookedMeeting(data.lead.bookedMeeting);
        setShowCalendar(false);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `📅 Meeting scheduled for ${new Date(selectedSlot).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. Looking forward to our call!`,
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBookingLoading(false);
    }
  };

  const formatDateLabel = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTimeLabel = (isoStr) => {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-body)',
      overflow: 'hidden',
      border: '1px solid var(--border-glass)',
      borderRadius: '16px'
    }}>
      
      {/* Widget Header */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-glass)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          color: '#fff',
          fontSize: '16px',
          boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)'
        }}>
          A
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Apex Assistant
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-qualified)', display: 'inline-block' }} />
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Typically replies instantly</p>
        </div>
        <button 
          onClick={() => window.parent.postMessage({ type: 'toggle-chat' }, '*')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Messages List Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'radial-gradient(ellipse at bottom, rgba(15, 19, 34, 0.2) 0%, var(--bg-primary) 100%)'
      }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            animation: 'fadeIn 0.3s ease-out'
          }}>
            <div style={{
              maxWidth: '85%',
              background: msg.role === 'user' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.04)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border-glass)',
              color: 'var(--text-primary)',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '16px 16px 0 16px' : '16px 16px 16px 0',
              fontSize: '13.5px',
              lineHeight: '1.45',
              boxShadow: msg.role === 'user' ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none'
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-glass)',
              padding: '12px 16px',
              borderRadius: '16px 16px 16px 0',
              display: 'flex',
              gap: '4px',
              alignItems: 'center'
            }}>
              <span className="dot" style={{ width: '6px', height: '6px', background: 'var(--text-muted)', borderRadius: '50%', animation: 'blink 1.4s infinite both' }} />
              <span className="dot" style={{ width: '6px', height: '6px', background: 'var(--text-muted)', borderRadius: '50%', animation: 'blink 1.4s infinite both', animationDelay: '.2s' }} />
              <span className="dot" style={{ width: '6px', height: '6px', background: 'var(--text-muted)', borderRadius: '50%', animation: 'blink 1.4s infinite both', animationDelay: '.4s' }} />
            </div>
          </div>
        )}

        {/* CSS for loading dots and keyframes */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes blink {
            0% { opacity: .2; }
            20% { opacity: 1; }
            100% { opacity: .2; }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}} />

        {/* Embedded Calendar Scheduler */}
        {showCalendar && !bookedMeeting && (
          <div className="glass-card animate-fade-in" style={{
            background: 'rgba(15, 19, 34, 0.9)',
            borderColor: 'rgba(6, 182, 212, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '16px',
            borderRadius: '12px'
          }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--status-booked)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Select Meeting Time
            </h4>

            {uniqueDates.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>No slots available this week.</p>
            ) : (
              <>
                {/* Horizontal Date Selector */}
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                  {uniqueDates.map(dateStr => (
                    <button
                      key={dateStr}
                      onClick={() => {
                        setSelectedDate(dateStr);
                        setSelectedSlot(null);
                      }}
                      style={{
                        flexShrink: 0,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: selectedDate === dateStr ? 'var(--accent-secondary)' : 'rgba(255,255,255,0.03)',
                        border: selectedDate === dateStr ? 'none' : '1px solid var(--border-glass)',
                        color: selectedDate === dateStr ? '#000' : 'var(--text-primary)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {formatDateLabel(dateStr)}
                    </button>
                  ))}
                </div>

                {/* Grid Time Slots */}
                {selectedDate && slotsByDate[selectedDate] && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    maxHeight: '120px',
                    overflowY: 'auto'
                  }}>
                    {slotsByDate[selectedDate].map(slot => (
                      <button
                        key={slot}
                        onClick={() => setSelectedSlot(slot)}
                        style={{
                          padding: '8px',
                          borderRadius: '6px',
                          background: selectedSlot === slot ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.02)',
                          border: selectedSlot === slot ? '1px solid var(--status-booked)' : '1px solid var(--border-glass)',
                          color: selectedSlot === slot ? 'var(--status-booked)' : 'var(--text-secondary)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {formatTimeLabel(slot)}
                      </button>
                    ))}
                  </div>
                )}

                {selectedSlot && (
                  <button
                    onClick={handleBookMeeting}
                    disabled={bookingLoading}
                    className="btn btn-primary"
                    style={{
                      background: 'var(--status-booked)',
                      boxShadow: '0 4px 10px rgba(6, 182, 212, 0.2)',
                      padding: '10px',
                      fontSize: '12px',
                      marginTop: '4px'
                    }}
                  >
                    {bookingLoading ? 'Booking...' : 'Confirm Call Booking'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Message Form */}
      <form 
        onSubmit={handleSendMessage}
        style={{
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-glass)',
          padding: '14px 16px',
          display: 'flex',
          gap: '10px',
          alignItems: 'center'
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading || bookedMeeting !== null}
          placeholder={
            bookedMeeting 
              ? "Call scheduled! Chat disabled." 
              : "Ask a question or reply..."
          }
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-glass)',
            borderRadius: '10px',
            padding: '12px 16px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || bookedMeeting !== null}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: input.trim() && !loading && !bookedMeeting ? 'var(--accent-primary)' : 'rgba(255,255,255,0.02)',
            border: 'none',
            color: input.trim() && !loading && !bookedMeeting ? '#fff' : 'var(--text-muted)',
            cursor: input.trim() && !loading && !bookedMeeting ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'var(--transition-fast)'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>

    </div>
  );
}

import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'db.json');

const DEFAULT_STATE = {
  leads: [],
  settings: {
    systemPrompt: `You are an AI Appointment Setter for 'Apex Digital Solutions'. Your goal is to qualify the lead conversationally.
Do NOT present a boring questionnaire. Ask questions naturally one by one in a friendly, conversational tone.

Your goals:
1. Answer any FAQs the lead has using only the custom knowledge base. If you don't know the answer, say you will note it down for our human team.
2. Qualify the lead by discovering:
   - Need (what problem are they trying to solve?)
   - Budget (do they have at least $3,000 for this project?)
   - Timeline (are they looking to start within 1-3 months?)
3. Once you have qualified their Need, Budget, and Timeline:
   - Ask for their Name and Email address to confirm details.
   - Once they provide Name and Email, output the exact token: [SHOW_CALENDAR]
     This token is critical. It will automatically load the calendar scheduling UI so they can select a time slot.

Be concise, warm, and professional. Always keep your replies under 3 sentences unless answering a detailed FAQ.`,
    faqs: [
      {
        id: "faq-1",
        question: "What does Apex Digital Solutions do?",
        answer: "We are a full-service digital agency specializing in custom web applications, AI integrations, automation workflows, and cloud migrations."
      },
      {
        id: "faq-2",
        question: "What is your pricing model?",
        answer: "Our custom solutions typically start at $3,000 depending on the complexity, integrations, and timeline. We offer fixed-price projects and monthly retainer options."
      },
      {
        id: "faq-3",
        question: "How long does a typical project take?",
        answer: "A standard web app or automation project takes between 4 to 8 weeks. Larger enterprise projects can take 3 months or more."
      }
    ],
    googleCalendar: {
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      isEnabled: false,
      isMockMode: true
    }
  }
};

// Helper to safely read database
export function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDb(DEFAULT_STATE);
      return DEFAULT_STATE;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database:', error);
    return DEFAULT_STATE;
  }
}

// Helper to write database atomically
export function writeDb(data) {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
    return true;
  } catch (error) {
    console.error('Error writing database:', error);
    return false;
  }
}

// Leads CRUD operations
export function getLeads() {
  const db = readDb();
  return db.leads || [];
}

export function saveLead(lead) {
  const db = readDb();
  const index = db.leads.findIndex(l => l.id === lead.id);
  if (index !== -1) {
    db.leads[index] = { ...db.leads[index], ...lead, updatedAt: new Date().toISOString() };
  } else {
    db.leads.push({
      ...lead,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  writeDb(db);
  return lead;
}

export function deleteLead(leadId) {
  const db = readDb();
  db.leads = db.leads.filter(l => l.id !== leadId);
  writeDb(db);
  return true;
}

// Settings operations
export function getSettings() {
  const db = readDb();
  return db.settings || DEFAULT_STATE.settings;
}

export function saveSettings(settings) {
  const db = readDb();
  db.settings = { ...db.settings, ...settings };
  writeDb(db);
  return db.settings;
}

import { getSettings } from './db.js';

// Clean system prompt helper
function compileSystemInstruction(settings) {
  const faqsText = settings.faqs
    .map(f => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n');

  return `${settings.systemPrompt}

Here is our knowledge base to answer user questions:
${faqsText}

IMPORTANT: You must return a JSON response matching this schema:
{
  "reply": "Your next conversational message to the user.",
  "extractedInfo": {
    "need": "Summarized need if they mentioned what they want to build (or null)",
    "budget": "Extracted budget/price range if they mentioned it (or null)",
    "timeline": "Extracted launch timeline if they mentioned it (or null)",
    "name": "User's full name if they provided it (or null)",
    "email": "User's email address if they provided it (or null)"
  },
  "isQualified": false, // Set to true if Need, Budget, and Timeline have all been discussed and meet requirements (budget >= $3000, timeline within 3 months)
  "showCalendar": false // Set to true if isQualified is true AND you have successfully captured their name and email and are prompting them to book a time.
}

Ensure all JSON properties are closed, and do not include markdown backticks around the JSON - return ONLY the raw JSON string.`;
}

// Simulated bot logic when GEMINI_API_KEY is not configured
function getSimulatedResponse(transcript, settings, lead) {
  // Simple heuristic based state machine
  const messages = transcript || [];
  const lastUserMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
  
  // Extract info from lead
  const extractedInfo = {
    need: lead.need || null,
    budget: lead.budget || null,
    timeline: lead.timeline || null,
    name: lead.name || null,
    email: lead.email || null
  };

  // 1. Check FAQs first
  for (const faq of settings.faqs) {
    const questionKeywords = faq.question.toLowerCase().split(' ');
    const matchCount = questionKeywords.filter(word => word.length > 3 && lastUserMsg.includes(word)).length;
    if (matchCount >= 2 || lastUserMsg.includes(faq.question.toLowerCase())) {
      return {
        reply: `${faq.answer} By the way, to see if we can help with your project, what specific requirements or goals do you have in mind?`,
        extractedInfo,
        isQualified: false,
        showCalendar: false
      };
    }
  }

  // 2. State transition based on what's missing
  let reply = '';
  let showCalendar = false;
  let isQualified = false;

  // Simple parser of user inputs
  if (lastUserMsg) {
    if (!extractedInfo.need) {
      extractedInfo.need = messages[messages.length - 1]?.content;
    } else if (!extractedInfo.budget) {
      // Look for numbers or budget terms
      const budgetMatch = lastUserMsg.match(/\$?(\d+[\d,kK]*)/);
      if (budgetMatch) {
        extractedInfo.budget = budgetMatch[0];
      } else {
        extractedInfo.budget = messages[messages.length - 1]?.content;
      }
    } else if (!extractedInfo.timeline) {
      extractedInfo.timeline = messages[messages.length - 1]?.content;
    } else if (!extractedInfo.name || !extractedInfo.email) {
      // Try to parse name and email
      const emailMatch = lastUserMsg.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        extractedInfo.email = emailMatch[0];
        // Guess name as the rest of the text
        const namePart = lastUserMsg.replace(emailMatch[0], '').replace(/my name is|i am|this is/g, '').trim();
        if (namePart.length > 2) {
          extractedInfo.name = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        }
      }
      
      // If we got name/email from previous state
      if (!extractedInfo.name && lastUserMsg.length > 2 && !lastUserMsg.includes('@')) {
        extractedInfo.name = messages[messages.length - 1]?.content;
      }
      if (!extractedInfo.email && lastUserMsg.includes('@')) {
        extractedInfo.email = emailMatch ? emailMatch[0] : lastUserMsg;
      }
    }
  }

  // Determine qualification
  if (extractedInfo.need && extractedInfo.budget && extractedInfo.timeline) {
    isQualified = true;
  }

  // Formulate reply based on missing details
  if (!extractedInfo.need) {
    reply = "Hi! I am the AI assistant for Apex Digital Solutions. I'd love to help you book a meeting with our team. To get started, what kind of project are you looking to build?";
  } else if (!extractedInfo.budget) {
    reply = "That sounds like an interesting project! To make sure we're a good fit, what is your estimated budget or price range for this project?";
  } else if (!extractedInfo.timeline) {
    reply = "Got it. And what is your target timeline or launch date for this project?";
  } else if (!extractedInfo.name) {
    reply = "Excellent, those details look great. We are definitely able to help with this! To get a discovery call scheduled, what is your name?";
  } else if (!extractedInfo.email) {
    reply = `Thanks, ${extractedInfo.name}! What is your email address so we can send you the calendar invite?`;
  } else {
    reply = `Thank you, ${extractedInfo.name}. Everything is qualified! Please pick a time from our calendar below to book your discovery call.`;
    showCalendar = true;
  }

  return {
    reply,
    extractedInfo,
    isQualified,
    showCalendar
  };
}

export async function getAiResponse(transcript, lead) {
  const settings = getSettings();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log('[Gemini Service] No API Key found, running in Simulation Mode.');
    return getSimulatedResponse(transcript, settings, lead);
  }

  try {
    const systemInstruction = compileSystemInstruction(settings);
    
    // Map our transcript format to Gemini API format
    // Our format: { role: 'user' | 'assistant', content: 'text' }
    // Gemini contents format: { role: 'user' | 'model', parts: [{ text: '...' }] }
    const contents = transcript.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
      throw new Error('Empty response from Gemini API');
    }

    // Parse the JSON output from the model
    const parsed = JSON.parse(responseText.trim());
    return parsed;
  } catch (error) {
    console.error('[Gemini Service] Error calling Gemini API:', error);
    // Fall back to simulation mode if API call fails to prevent chatbot crash
    return getSimulatedResponse(transcript, settings, lead);
  }
}

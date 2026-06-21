# Apex Appointment Setter

A lightweight, high-performance conversational lead qualification and calendar booking system. It features an embeddable chat widget, a live dashboard, and a CRM interface for managing leads and scheduled calls.

## Features

- **Conversational Lead Qualification**: Qualifies leads dynamically (need, budget, timeline) rather than using static forms.
- **Interactive Scheduler**: Integrates directly with calendars to expose real-time booking slots and confirm appointments instantly in the chat window.
- **Admin Dashboard**: Tracks CRM analytics (qualification conversion rates, total leads, upcoming schedule).
- **Leads CRM**: Detailed inspector with full chat transcripts and captured parameters.
- **Knowledge Base (FAQs)**: Custom FAQ manager feeding business knowledge directly to the agent.
- **Embeddable Widget**: Floating widget launcher script that injects an iframe container onto any website.
- **Mock/Real Integrations**: Works out of the box using simulated database bookings, with optional OAuth integration for Google Calendar API.

## Tech Stack

- **Framework**: Next.js (App Router, JavaScript)
- **Styling**: Vanilla CSS (Global CSS variables, glassmorphic dark theme)
- **Database**: Local atomic JSON store (`db.json`)
- **LLM Engine**: Google Gemini API (with simulated fallback for offline testing)

## Getting Started

### Prerequisites

- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone <your-repository-url>
   cd ai-appointment-setter
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file by copying the template:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and add your `GEMINI_API_KEY` (optional; the app runs in rule-based simulation mode if not provided).

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser:
   - **Dashboard**: [http://localhost:3000](http://localhost:3000)
   - **Widget Demo**: [http://localhost:3000/widget](http://localhost:3000/widget)

## Embedding the Widget

To place the chat widget on your website, copy the script below and insert it before the closing `</body>` tag:

```html
<script 
  src="http://localhost:3000/widget.js" 
  id="ai-appointment-setter"
></script>
```

The script will automatically detect the server origin and spin up a responsive floating support bubble in the bottom right corner of the page.

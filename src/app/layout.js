import "./globals.css";

export const metadata = {
  title: "AI Appointment Setter | Dashboard",
  description: "Qualify leads instantly and book Google Calendar meetings using a conversational assistant.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

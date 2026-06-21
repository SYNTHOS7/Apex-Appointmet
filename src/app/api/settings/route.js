import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/db';

export async function GET() {
  try {
    const settings = getSettings();
    
    // For security, don't return the full clientSecret / refreshToken to the frontend if they exist.
    // We can return a masked version or boolean indicator.
    const sanitizedSettings = {
      ...settings,
      googleCalendar: {
        clientId: settings.googleCalendar.clientId || '',
        clientSecret: settings.googleCalendar.clientSecret ? '••••••••••••' : '',
        refreshToken: settings.googleCalendar.refreshToken ? '••••••••••••' : '',
        isEnabled: settings.googleCalendar.isEnabled || false,
        isMockMode: settings.googleCalendar.isMockMode !== false, // default true
      }
    };

    return NextResponse.json({ settings: sanitizedSettings });
  } catch (error) {
    console.error('[Settings API GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const newSettings = await request.json();
    const currentSettings = getSettings();

    // Preserve existing credentials if they are masked in the payload (meaning the user didn't change them)
    const updatedCalendar = { ...newSettings.googleCalendar };
    if (updatedCalendar.clientSecret === '••••••••••••') {
      updatedCalendar.clientSecret = currentSettings.googleCalendar.clientSecret;
    }
    if (updatedCalendar.refreshToken === '••••••••••••') {
      updatedCalendar.refreshToken = currentSettings.googleCalendar.refreshToken;
    }

    const saved = saveSettings({
      ...newSettings,
      googleCalendar: updatedCalendar
    });

    return NextResponse.json({ success: true, settings: saved });
  } catch (error) {
    console.error('[Settings API POST] Error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

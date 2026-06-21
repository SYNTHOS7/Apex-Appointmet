import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // 1. Identify public API routes that should never require authentication
  const isPublicApi = 
    pathname.startsWith('/api/auth') || 
    pathname.startsWith('/api/chat') || 
    pathname.startsWith('/api/calendar');

  // 2. Identify public pages that should never require authentication
  const isPublicPage = 
    pathname === '/login' || 
    pathname.startsWith('/widget');

  // If public, let it pass through
  if (isPublicApi || isPublicPage) {
    return NextResponse.next();
  }

  // 3. Authenticated check for everything else (pages and admin APIs)
  const session = request.cookies.get('admin_session');
  const isAuthenticated = session && session.value === 'authenticated';

  if (!isAuthenticated) {
    // Return 401 JSON for admin APIs
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Redirect to login page for UI pages
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - widget.js (public widget script)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|widget\\.js).*)',
  ],
};

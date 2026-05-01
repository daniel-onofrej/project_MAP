import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/_next',
  '/favicon.ico',
  '/icons',
  '/images',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths through immediately
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Check for session cookie (lightweight check — full validation in API handlers)
  const sessionCookie = request.cookies.get('map_session')

  if (!sessionCookie?.value) {
    // For API routes, return 401 JSON instead of redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // For page routes, redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Pass the user identity hints forward via headers (API routes can use these
  // as a fast path, but MUST still validate the full session via getSessionUser())
  const response = NextResponse.next()
  return response
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}

import { createHash, randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { sessions, users } from '@/db/schema'
import { eq, and, gt } from 'drizzle-orm'
import type { User } from '@/db/schema'

const COOKIE_NAME = 'map_session'
const SESSION_TTL_DAYS = 7

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'avatarUrl' | 'isActive'>

// ── Token helpers ────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ── Create session ────────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  })

  return token
}

// ── Set session cookie ────────────────────────────────────────────────────────

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  // Never set secure=true unless the app is explicitly configured to run on HTTPS.
  // Setting secure=true on an HTTP deployment means browsers silently drop the cookie,
  // causing every request to return 401.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const isHttps = appUrl.startsWith('https://')
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'strict' : 'lax',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    path: '/',
  })
}

// ── Get session user from cookie ──────────────────────────────────────────────

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return getSessionUserFromToken(token)
}

export async function getSessionUserFromToken(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token)
  const now = new Date()

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      avatarUrl: users.avatarUrl,
      isActive: users.isActive,
      sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1)

  if (!rows.length) return null
  const row = rows[0]
  if (!row.isActive) return null

  // Extend session TTL on each use (sliding expiry)
  await db
    .update(sessions)
    .set({
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
    })
    .where(eq(sessions.id, row.sessionId))

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatarUrl,
    isActive: row.isActive,
  }
}

// ── Delete session (logout) ───────────────────────────────────────────────────

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  if (token) {
    const tokenHash = hashToken(token)
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
  }

  cookieStore.delete(COOKIE_NAME)
}

// ── Get token from request headers (for middleware — no cookies() available) ──

export function getTokenFromRequestHeaders(headers: Headers): string | null {
  const cookieHeader = headers.get('cookie') ?? ''
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
  return match ? match[1] : null
}

// ── Validate raw token (used in middleware) ───────────────────────────────────
// Note: middleware cannot use the db directly (edge runtime), so it only checks cookie presence.
// Full validation happens in API route handlers via getSessionUser().
export function hasSessionCookie(headers: Headers): boolean {
  return getTokenFromRequestHeaders(headers) !== null
}

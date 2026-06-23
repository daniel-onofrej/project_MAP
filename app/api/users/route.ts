export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { hashSync } from 'bcryptjs'
import { db } from '@/db'
import { users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { desc, ilike, or, sql } from 'drizzle-orm'

// GET /api/users — list users.
// ?search=query  → any logged-in user can search (for invite flows), returns id/name/email only
// (no search)    → admin only, returns full user records
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const search = request.nextUrl.searchParams.get('search')?.trim()

  // Search mode — available to all logged-in users for invite flows
  if (search) {
    const pattern = `%${search}%`
    const results = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(or(ilike(users.name, pattern), ilike(users.email, pattern)))
      .orderBy(users.name)
      .limit(10)
    return NextResponse.json({ users: results })
  }

  // Full list — admin only
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const all = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      avatarUrl: users.avatarUrl,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))

  return NextResponse.json({ users: all })
}

// POST /api/users — create a user (admin only)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const user = await getSessionUser()
  const { email, password, name } = body
  let role = body.role ?? 'editor'

  if (!user) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users)
    if ((row?.count ?? 0) > 0) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    role = 'admin'
  } else if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!email || !password || !name) {
    return NextResponse.json({ error: 'email, password, and name are required' }, { status: 400 })
  }
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const passwordHash = hashSync(password, 12)

  try {
    const [created] = await db
      .insert(users)
      .values({ email: email.toLowerCase().trim(), passwordHash, name, role })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role })

    return NextResponse.json({ user: created }, { status: 201 })
  } catch (err: any) {
    if (err.message?.includes('unique')) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    }
    console.error('[POST /api/users]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

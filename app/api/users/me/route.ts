export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { hashSync, compareSync } from 'bcryptjs'
import { db } from '@/db'
import { users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq } from 'drizzle-orm'

// PATCH /api/users/me — update own profile (name, password)
export async function PATCH(request: NextRequest) {
  const currentUser = await getSessionUser()
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const update: Partial<typeof users.$inferInsert> = {}

  if (body.name) update.name = body.name

  // Password change requires currentPassword verification
  if (body.newPassword) {
    if (!body.currentPassword) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 })
    }

    // Fetch the current password hash
    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1)

    if (!row?.passwordHash || !compareSync(body.currentPassword, row.passwordHash)) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    if (body.newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }

    update.passwordHash = hashSync(body.newPassword, 12)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(users)
    .set(update)
    .where(eq(users.id, currentUser.id))
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role })

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ user: updated })
}

// GET /api/users/me — return current user
export async function GET() {
  const currentUser = await getSessionUser()
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, currentUser.id))
    .limit(1)

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ user: row })
}

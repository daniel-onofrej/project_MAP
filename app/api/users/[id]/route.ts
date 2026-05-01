export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { hashSync } from 'bcryptjs'
import { db } from '@/db'
import { users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq } from 'drizzle-orm'

type Params = { id: string }

// PATCH /api/users/[id] — update user (admin only, or own profile)
export async function PATCH(request: NextRequest, { params }: { params: Promise<Params> }) {
  const currentUser = await getSessionUser()
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const isSelf = currentUser.id === id
  const isAdmin = currentUser.role === 'admin'

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const update: Partial<typeof users.$inferInsert> = {}

  if (body.name) update.name = body.name
  if (body.avatarUrl !== undefined) update.avatarUrl = body.avatarUrl
  if (body.password) update.passwordHash = hashSync(body.password, 12)

  // Only admin can change role or active status
  if (isAdmin) {
    if (body.role && ['admin', 'editor', 'viewer'].includes(body.role)) update.role = body.role
    if (body.isActive !== undefined) update.isActive = body.isActive
  }

  const [updated] = await db
    .update(users)
    .set(update)
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive })

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ user: updated })
}

// DELETE /api/users/[id] — deactivate user (admin only, cannot delete self)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const currentUser = await getSessionUser()
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (currentUser.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (id === currentUser.id) {
    return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
  }

  await db.update(users).set({ isActive: false }).where(eq(users.id, id))
  return NextResponse.json({ ok: true })
}

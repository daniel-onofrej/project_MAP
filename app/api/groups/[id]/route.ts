export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { groups, groupMembers, users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'

type Params = { id: string }

// GET /api/groups/[id] — get group with members
export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const members = await db
    .select({
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt,
      user: { id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, role: users.role },
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, id))

  return NextResponse.json({ group, members })
}

// PATCH /api/groups/[id] — update group name/description (owner or admin)
export async function PATCH(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  if (user.role !== 'admin') {
    const [m] = await db.select({ role: groupMembers.role }).from(groupMembers)
      .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, user.id))).limit(1)
    if (!m || m.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const update: Partial<typeof groups.$inferInsert> = {}
  if (body.name) update.name = body.name.trim()
  if (body.description !== undefined) update.description = body.description

  const [updated] = await db.update(groups).set(update).where(eq(groups.id, id)).returning()
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ group: updated })
}

// DELETE /api/groups/[id] — delete group (admin or owner)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  if (user.role !== 'admin') {
    const [m] = await db.select({ role: groupMembers.role }).from(groupMembers)
      .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, user.id))).limit(1)
    if (!m || m.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.delete(groups).where(eq(groups.id, id))
  return NextResponse.json({ ok: true })
}

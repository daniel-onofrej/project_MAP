export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { groupMembers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'

type Params = { id: string; userId: string }

async function canManageMember(groupId: string, actorId: string, actorRole: string) {
  if (actorRole === 'admin') return true
  const [m] = await db.select({ role: groupMembers.role }).from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actorId))).limit(1)
  return m?.role === 'owner'
}

// DELETE /api/groups/[id]/members/[userId] — remove member
export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId, userId: targetUserId } = await params

  // Can remove yourself, or owner/admin can remove others
  if (user.id !== targetUserId) {
    const allowed = await canManageMember(groupId, user.id, user.role)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.delete(groupMembers).where(
    and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId))
  )

  return NextResponse.json({ ok: true })
}

// PATCH /api/groups/[id]/members/[userId] — change member role
export async function PATCH(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId, userId: targetUserId } = await params

  const allowed = await canManageMember(groupId, user.id, user.role)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const role = body.role
  if (!['owner', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  await db
    .update(groupMembers)
    .set({ role })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)))

  return NextResponse.json({ ok: true })
}

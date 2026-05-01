export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { groupMembers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'

type Params = { id: string }

// POST /api/groups/[id]/members — add a member
export async function POST(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId } = await params

  if (user.role !== 'admin') {
    const [m] = await db.select({ role: groupMembers.role }).from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id))).limit(1)
    if (!m || m.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  if (!body.userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  await db
    .insert(groupMembers)
    .values({ groupId, userId: body.userId, role: body.role ?? 'editor' })
    .onConflictDoUpdate({
      target: [groupMembers.groupId, groupMembers.userId],
      set: { role: body.role ?? 'editor' },
    })

  return NextResponse.json({ ok: true }, { status: 201 })
}

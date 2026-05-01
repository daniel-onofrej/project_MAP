export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents, agentShares, groupMembers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'

type Params = { id: string }

// POST /api/agents/[id]/share — share with a user or a group
// Body: { userId?: string, groupId?: string, permission: 'view' | 'edit' | 'comment' }
export async function POST(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  // Only owner or admin can share
  const [agent] = await db.select({ ownerId: agents.ownerId }).from(agents).where(eq(agents.id, id)).limit(1)
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (user.role !== 'admin' && agent.ownerId !== user.id) {
    return NextResponse.json({ error: 'Forbidden — only owner or admin can share' }, { status: 403 })
  }

  const permission = body.permission ?? 'view'

  if (body.userId) {
    await db
      .insert(agentShares)
      .values({ agentId: id, userId: body.userId, permission, sharedBy: user.id })
      .onConflictDoUpdate({
        target: [agentShares.agentId, agentShares.userId],
        set: { permission },
      })
    await writeAuditLog({
      agentId: id,
      userId: user.id,
      eventType: 'agent_shared',
      metadata: { sharedWithUserId: body.userId, permission },
    })
  } else if (body.groupId) {
    // When sharing with a group: update agent's groupId
    await db.update(agents).set({ groupId: body.groupId }).where(eq(agents.id, id))
    await writeAuditLog({
      agentId: id,
      userId: user.id,
      eventType: 'agent_shared',
      metadata: { sharedWithGroupId: body.groupId },
    })
  } else {
    return NextResponse.json({ error: 'Provide userId or groupId' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

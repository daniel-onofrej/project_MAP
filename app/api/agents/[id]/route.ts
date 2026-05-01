export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents, agentShares, groupMembers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and, or, inArray } from 'drizzle-orm'
import { publishAgentEvent } from '@/lib/realtime/publisher'
import { writeAuditLog, diffNodes } from '@/lib/audit'

type Params = { id: string }

// ── Access check helper ──────────────────────────────────────────────────────

async function getAgentIfAccessible(agentId: string, userId: string, userRole: string) {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)
  if (!agent) return null

  if (userRole === 'admin' || agent.ownerId === userId || agent.isPublicInOrg) return agent

  // Check group membership
  if (agent.groupId) {
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, agent.groupId), eq(groupMembers.userId, userId)))
      .limit(1)
    if (membership) return agent
  }

  // Check explicit share
  const [share] = await db
    .select()
    .from(agentShares)
    .where(and(eq(agentShares.agentId, agentId), eq(agentShares.userId, userId)))
    .limit(1)
  if (share) return agent

  return null
}

async function canEdit(agentId: string, userId: string, userRole: string): Promise<boolean> {
  if (userRole === 'viewer') return false
  if (userRole === 'admin') return true

  const [agent] = await db.select({ ownerId: agents.ownerId, groupId: agents.groupId })
    .from(agents).where(eq(agents.id, agentId)).limit(1)
  if (!agent) return false
  if (agent.ownerId === userId) return true

  if (agent.groupId) {
    const [m] = await db.select({ role: groupMembers.role }).from(groupMembers)
      .where(and(eq(groupMembers.groupId, agent.groupId), eq(groupMembers.userId, userId))).limit(1)
    if (m && m.role !== 'viewer') return true
  }

  const [share] = await db.select({ permission: agentShares.permission }).from(agentShares)
    .where(and(eq(agentShares.agentId, agentId), eq(agentShares.userId, userId))).limit(1)
  if (share && share.permission === 'edit') return true

  return false
}

// ── GET /api/agents/[id] ─────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const agent = await getAgentIfAccessible(id, user.id, user.role)
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ agent })
}

// ── PATCH /api/agents/[id] ───────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const editable = await canEdit(id, user.id, user.role)
  if (!editable) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()

    // Fetch current state for diffing
    const [current] = await db.select().from(agents).where(eq(agents.id, id)).limit(1)
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Never allow overwriting owner or stripping api_key from settings
    const updateData: Partial<typeof agents.$inferInsert> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.originalPrompt !== undefined) updateData.originalPrompt = body.originalPrompt
    if (body.editedPrompt !== undefined) updateData.editedPrompt = body.editedPrompt
    if (body.nodes !== undefined) updateData.nodes = body.nodes
    if (body.connections !== undefined) updateData.connections = body.connections
    if (body.annotations !== undefined) updateData.annotations = body.annotations
    if (body.settings !== undefined) updateData.settings = { ...body.settings, apiKey: undefined }
    if (body.version !== undefined) updateData.version = body.version
    if (body.groupId !== undefined) updateData.groupId = body.groupId
    if (body.isPublicInOrg !== undefined) updateData.isPublicInOrg = body.isPublicInOrg
    if (body.currentVersionId !== undefined) updateData.currentVersionId = body.currentVersionId

    const [updated] = await db
      .update(agents)
      .set(updateData)
      .where(eq(agents.id, id))
      .returning()

    // Compute node diffs for audit log
    if (body.nodes !== undefined) {
      const nodeDiffs = diffNodes(current.nodes as any[], body.nodes)
      for (const diff of nodeDiffs) {
        await writeAuditLog({
          agentId: id,
          userId: user.id,
          eventType: diff.type,
          diff: diff.diff,
          metadata: { nodeId: diff.nodeId, label: diff.label },
        })
      }
    } else {
      await writeAuditLog({
        agentId: id,
        userId: user.id,
        eventType: 'agent_updated',
        metadata: { fields: Object.keys(updateData) },
      })
    }

    // Publish real-time event to all SSE subscribers
    await publishAgentEvent(id, {
      type: 'graph_update',
      payload: updateData,
      by: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
    })

    return NextResponse.json({ agent: updated })
  } catch (err) {
    console.error('[PATCH /api/agents/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE /api/agents/[id] ──────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const [agent] = await db.select({ ownerId: agents.ownerId }).from(agents).where(eq(agents.id, id)).limit(1)
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only owner or admin can delete
  if (user.role !== 'admin' && agent.ownerId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await writeAuditLog({ agentId: id, userId: user.id, eventType: 'agent_deleted', metadata: {} })
  await db.delete(agents).where(eq(agents.id, id))

  return NextResponse.json({ ok: true })
}

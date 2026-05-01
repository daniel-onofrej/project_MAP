export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { nodeLocks } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'
import { publishAgentEvent } from '@/lib/realtime/publisher'

type Params = { id: string; nodeId: string }
const LOCK_TTL_SECONDS = 30

// POST /api/agents/[id]/nodes/[nodeId]/lock — acquire node lock
export async function POST(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: agentId, nodeId } = await params
  const expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000)

  // Upsert: acquire lock or extend if already held by same user
  try {
    await db
      .insert(nodeLocks)
      .values({ agentId, nodeId, lockedBy: user.id, expiresAt })
      .onConflictDoUpdate({
        target: [nodeLocks.agentId, nodeLocks.nodeId],
        set: { lockedBy: user.id, expiresAt, lockedAt: new Date() },
        // Only allow overwrite if lock has expired
        setWhere: eq(nodeLocks.lockedBy, user.id),
      })
  } catch {
    // Lock held by another user — check if expired
    const [existing] = await db
      .select()
      .from(nodeLocks)
      .where(and(eq(nodeLocks.agentId, agentId), eq(nodeLocks.nodeId, nodeId)))
      .limit(1)

    if (existing && existing.expiresAt > new Date()) {
      return NextResponse.json(
        { error: 'Node is locked by another user', lockedBy: existing.lockedBy },
        { status: 409 }
      )
    }
    // Expired lock — force acquire
    await db
      .insert(nodeLocks)
      .values({ agentId, nodeId, lockedBy: user.id, expiresAt })
      .onConflictDoUpdate({
        target: [nodeLocks.agentId, nodeLocks.nodeId],
        set: { lockedBy: user.id, expiresAt, lockedAt: new Date() },
      })
  }

  await publishAgentEvent(agentId, {
    type: 'node_locked',
    nodeId,
    by: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
    expiresAt: expiresAt.toISOString(),
  })

  return NextResponse.json({ ok: true, expiresAt })
}

// DELETE /api/agents/[id]/nodes/[nodeId]/lock — release lock
export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: agentId, nodeId } = await params

  await db
    .delete(nodeLocks)
    .where(and(
      eq(nodeLocks.agentId, agentId),
      eq(nodeLocks.nodeId, nodeId),
      eq(nodeLocks.lockedBy, user.id)
    ))

  await publishAgentEvent(agentId, {
    type: 'node_unlocked',
    nodeId,
    by: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
  })

  return NextResponse.json({ ok: true })
}

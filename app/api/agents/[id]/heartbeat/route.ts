export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { nodeLocks } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'
import { getRedis } from '@/lib/redis'

type Params = { id: string }
const LOCK_TTL_SECONDS = 30

// POST /api/agents/[id]/heartbeat
// Extends presence TTL in Redis + extends all node locks held by this user
export async function POST(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: agentId } = await params
  const now = Date.now()
  const newExpiry = new Date(now + LOCK_TTL_SECONDS * 1000)

  // Update presence in Redis sorted set
  try {
    const redis = getRedis()
    await redis.zadd(`presence:${agentId}`, now, user.id)
    // Clean up stale presence entries (> 60s old)
    await redis.zremrangebyscore(`presence:${agentId}`, '-inf', now - 60_000)
  } catch {
    // Redis unavailable — degrade gracefully
  }

  // Extend node lock TTLs for this user
  await db
    .update(nodeLocks)
    .set({ expiresAt: newExpiry })
    .where(and(eq(nodeLocks.agentId, agentId), eq(nodeLocks.lockedBy, user.id)))

  return NextResponse.json({ ok: true, serverTime: new Date().toISOString() })
}

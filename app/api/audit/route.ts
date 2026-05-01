export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { auditLog, users, agents } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, desc } from 'drizzle-orm'

// GET /api/audit — company-wide activity feed (admin only)
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const entries = await db
    .select({
      id: auditLog.id,
      eventType: auditLog.eventType,
      diff: auditLog.diff,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      agent: { id: agents.id, name: agents.name },
      user: { id: users.id, name: users.name, avatarUrl: users.avatarUrl },
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .leftJoin(agents, eq(auditLog.agentId, agents.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({ entries })
}

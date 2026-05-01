export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { auditLog, users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, desc } from 'drizzle-orm'

type Params = { id: string }

// GET /api/agents/[id]/audit — get audit log for this agent (paginated)
export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const entries = await db
    .select({
      id: auditLog.id,
      eventType: auditLog.eventType,
      diff: auditLog.diff,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      user: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        role: users.role,
      },
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(eq(auditLog.agentId, id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({ entries })
}

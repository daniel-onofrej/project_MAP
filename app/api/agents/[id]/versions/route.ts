export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents, agentVersions } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, desc } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'

type Params = { id: string }

// GET /api/agents/[id]/versions — list versions
export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const versions = await db
    .select()
    .from(agentVersions)
    .where(eq(agentVersions.agentId, id))
    .orderBy(desc(agentVersions.createdAt))

  return NextResponse.json({ versions })
}

// POST /api/agents/[id]/versions — commit a new version snapshot
export async function POST(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1)
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [version] = await db
    .insert(agentVersions)
    .values({
      agentId: id,
      versionLabel: body.versionLabel ?? new Date().toISOString(),
      nodes: agent.nodes,
      connections: agent.connections,
      commitMessage: body.commitMessage,
      createdBy: user.id,
      parentVersionId: agent.currentVersionId ?? null,
    })
    .returning()

  // Update agent's current version pointer
  await db.update(agents).set({ currentVersionId: version.id }).where(eq(agents.id, id))

  await writeAuditLog({
    agentId: id,
    userId: user.id,
    eventType: 'version_committed',
    metadata: { versionId: version.id, label: version.versionLabel, message: body.commitMessage },
  })

  return NextResponse.json({ version }, { status: 201 })
}

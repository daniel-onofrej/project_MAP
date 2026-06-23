export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agentDeployments, agents, agentShares, groupMembers, promptAgentLinks } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, or, and, inArray, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { publishAgentEvent } from '@/lib/realtime/publisher'
import { writeAuditLog } from '@/lib/audit'
import { normalizeRuntimePackage } from '@/lib/runtime-assets'

// GET /api/agents — list agents accessible to current user
// Query params: ?group=<groupId> | ?mine=true | ?shared=true | ?search=<text>
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get('group')
  const mineOnly = searchParams.get('mine') === 'true'
  const sharedOnly = searchParams.get('shared') === 'true'

  // Build access conditions:
  // User can see agents that are:
  //   1. Owned by them
  //   2. In a group they belong to
  //   3. Explicitly shared with them
  //   4. Public in org (is_public_in_org = true)
  const userGroupIds = (
    await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id))
  ).map((r) => r.groupId)

  const sharedAgentIds = (
    await db
      .select({ agentId: agentShares.agentId })
      .from(agentShares)
      .where(eq(agentShares.userId, user.id))
  ).map((r) => r.agentId)

  let query = db.select().from(agents)

  if (mineOnly) {
    query = query.where(eq(agents.ownerId, user.id)) as typeof query
  } else if (sharedOnly) {
    if (sharedAgentIds.length === 0) {
      return NextResponse.json({ agents: [] })
    }
    query = query.where(inArray(agents.id, sharedAgentIds)) as typeof query
  } else if (groupId) {
    query = query.where(eq(agents.groupId, groupId)) as typeof query
  } else {
    // All accessible: own + in-group + shared + public
    const conditions = [
      eq(agents.ownerId, user.id),
      eq(agents.isPublicInOrg, true),
      ...(userGroupIds.length > 0 ? [inArray(agents.groupId, userGroupIds)] : []),
      ...(sharedAgentIds.length > 0 ? [inArray(agents.id, sharedAgentIds)] : []),
    ]
    query = query.where(or(...conditions)) as typeof query
  }

  const rows = await query.orderBy(desc(agents.updatedAt))

  // Strip large text fields from list view (only return on GET /api/agents/[id])
  const list = rows.map(({ originalPrompt: _op, editedPrompt: _ep, rawLlmOutput: _rlo, ...rest }) => rest)

  // Fetch linked agents (consumers) for each prompt
  const agentIds = list.map((a) => a.id)
  const links = agentIds.length > 0
    ? await db
        .select({
          promptAgentId: promptAgentLinks.promptAgentId,
          consumerName: agents.name,
          consumerId: agents.id,
        })
        .from(promptAgentLinks)
        .innerJoin(agents, eq(agents.id, promptAgentLinks.consumerAgentId))
        .where(inArray(promptAgentLinks.promptAgentId, agentIds))
    : []

  const linkedMap: Record<string, { id: string; name: string }[]> = {}
  for (const link of links) {
    if (!linkedMap[link.promptAgentId]) linkedMap[link.promptAgentId] = []
    linkedMap[link.promptAgentId].push({ id: link.consumerId, name: link.consumerName })
  }

  const deploymentRows = agentIds.length > 0
    ? await db
        .select({
          agentId: agentDeployments.agentId,
          status: agentDeployments.status,
          updatedAt: agentDeployments.updatedAt,
        })
        .from(agentDeployments)
        .where(inArray(agentDeployments.agentId, agentIds))
    : []

  const deploymentMap: Record<string, { count: number; latestStatus: string | null; latestAt: Date | null }> = {}
  for (const deployment of deploymentRows) {
    const current = deploymentMap[deployment.agentId] ?? { count: 0, latestStatus: null, latestAt: null }
    current.count += 1
    if (!current.latestAt || new Date(deployment.updatedAt) > current.latestAt) {
      current.latestAt = new Date(deployment.updatedAt)
      current.latestStatus = deployment.status
    }
    deploymentMap[deployment.agentId] = current
  }

  const enriched = list.map((a) => ({
    ...a,
    tags: (a.hubMeta as any)?.tags ?? [],
    groups: (a.hubMeta as any)?.groupIds
      ? ((a.hubMeta as any).groupIds as string[]).map((gid: string) => ({ id: gid, name: gid }))
      : a.groupId ? [{ id: a.groupId, name: a.groupId }] : [],
    lastChangeSummary: a.updatedAt
      ? `Updated ${new Date(a.updatedAt).toLocaleDateString()}`
      : null,
    linkedAgents: linkedMap[a.id] ?? [],
    pullCount: a.pullCount ?? 0,
    deploymentCount: deploymentMap[a.id]?.count ?? 0,
    latestDeploymentStatus: deploymentMap[a.id]?.latestStatus ?? null,
  }))

  return NextResponse.json({ agents: enriched })
}

// POST /api/agents — create a new agent
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    const id = body.id ?? nanoid()

    const [created] = await db
      .insert(agents)
      .values({
        id,
        name: body.name ?? 'Untitled Agent',
        description: body.description,
        originalPrompt: body.originalPrompt,
        editedPrompt: body.editedPrompt,
        nodes: body.nodes ?? [],
        connections: body.connections ?? [],
        annotations: body.annotations ?? [],
        settings: body.settings ? { ...body.settings, apiKey: undefined } : {},
        runtimePackage: normalizeRuntimePackage(body.runtimePackage),
        version: body.version,
        sourceFormat: body.sourceFormat,
        generatedWith: body.generatedWith,
        ownerId: user.id,
        groupId: body.groupId ?? null,
        isPublicInOrg: body.isPublicInOrg ?? false,
        parentAgentId: body.parentAgentId ?? null,
        childAgentIds: body.childAgentIds ?? [],
        agentRole: body.agentRole,
        hubMeta: body.hubMeta,
      })
      .returning()

    await writeAuditLog({
      agentId: id,
      userId: user.id,
      eventType: 'agent_created',
      metadata: { name: created.name },
    })

    return NextResponse.json({ agent: created }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/agents]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

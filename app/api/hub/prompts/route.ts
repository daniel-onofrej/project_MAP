export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { agentDeployments, agents, promptAgentLinks } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { desc, inArray, sql } from 'drizzle-orm'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all agents with prompt content that this user owns
  const promptAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      description: agents.description,
      originalPrompt: agents.originalPrompt,
      editedPrompt: agents.editedPrompt,
      pullCount: agents.pullCount,
      lastPulledAt: agents.lastPulledAt,
      lastPulledBy: agents.lastPulledBy,
      isPublicInOrg: agents.isPublicInOrg,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(
      sql`${agents.ownerId} = ${user.id} AND (${agents.originalPrompt} IS NOT NULL OR ${agents.editedPrompt} IS NOT NULL)`
    )
    .orderBy(desc(agents.updatedAt))

  if (promptAgents.length === 0) {
    return NextResponse.json({ prompts: [] })
  }

  // Fetch agent-prompt links for these prompt IDs
  const promptIds = promptAgents.map(p => p.id)
  const links = await db
    .select({
      promptAgentId: promptAgentLinks.promptAgentId,
      consumerAgentId: promptAgentLinks.consumerAgentId,
    })
    .from(promptAgentLinks)
    .where(
      sql`${promptAgentLinks.promptAgentId} = ANY(ARRAY[${sql.raw(promptIds.map(id => `'${id.replace(/'/g, "''")}'`).join(','))}]::text[])`
    )

  const deploymentRows = await db
    .select({
      id: agentDeployments.id,
      agentId: agentDeployments.agentId,
      name: agentDeployments.name,
      status: agentDeployments.status,
      openshellSandboxName: agentDeployments.openshellSandboxName,
      runtimeKind: agentDeployments.runtimeKind,
      runtimeCommand: agentDeployments.runtimeCommand,
      lastError: agentDeployments.lastError,
      lastLog: agentDeployments.lastLog,
      deployedAt: agentDeployments.deployedAt,
      stoppedAt: agentDeployments.stoppedAt,
      createdAt: agentDeployments.createdAt,
      updatedAt: agentDeployments.updatedAt,
    })
    .from(agentDeployments)
    .where(inArray(agentDeployments.agentId, promptIds))
    .orderBy(desc(agentDeployments.updatedAt))

  // Fetch consumer agent names
  const consumerIds = [...new Set(links.map(l => l.consumerAgentId))]
  const consumerNames: Record<string, string> = {}
  if (consumerIds.length > 0) {
    const consumers = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(
        sql`${agents.id} = ANY(ARRAY[${sql.raw(consumerIds.map(id => `'${id.replace(/'/g, "''")}'`).join(','))}]::text[])`
      )
    consumers.forEach(c => { consumerNames[c.id] = c.name })
  }

  // Build per-prompt link map
  const linkMap: Record<string, Array<{ id: string; name: string }>> = {}
  for (const link of links) {
    if (!linkMap[link.promptAgentId]) linkMap[link.promptAgentId] = []
    linkMap[link.promptAgentId].push({
      id: link.consumerAgentId,
      name: consumerNames[link.consumerAgentId] ?? 'Unknown',
    })
  }

  const deploymentMap: Record<string, typeof deploymentRows> = {}
  for (const deployment of deploymentRows) {
    if (!deploymentMap[deployment.agentId]) deploymentMap[deployment.agentId] = []
    deploymentMap[deployment.agentId].push(deployment)
  }

  const prompts = promptAgents.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    contentPreview: (p.editedPrompt ?? p.originalPrompt ?? '').slice(0, 120),
    status: p.isPublicInOrg ? 'active' : 'draft',
    pullCount: p.pullCount,
    lastPulledAt: p.lastPulledAt,
    lastPulledBy: p.lastPulledBy,
    updatedAt: p.updatedAt,
    agentCount: (linkMap[p.id] ?? []).length,
    agents: linkMap[p.id] ?? [],
    runtimeCount: (deploymentMap[p.id] ?? []).length,
    activeRuntimeCount: (deploymentMap[p.id] ?? []).filter(d => d.status === 'ready' || d.status === 'provisioning').length,
    runtimes: deploymentMap[p.id] ?? [],
  }))

  return NextResponse.json({ prompts })
}

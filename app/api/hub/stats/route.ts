export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { agentDeployments, agents, promptAgentLinks } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { isOpenShellRuntimeEnabled } from '@/lib/deployments/config'
import { eq, inArray, sql } from 'drizzle-orm'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Total prompts = agents owned by user that have originalPrompt content
  const [promptsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(
      sql`${agents.ownerId} = ${user.id} AND (${agents.originalPrompt} IS NOT NULL OR ${agents.editedPrompt} IS NOT NULL)`
    )

  // Total agents owned by user
  const [agentsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(eq(agents.ownerId, user.id))

  // Agents that have at least one prompt link (as consumer)
  const [linkedRow] = await db
    .select({ count: sql<number>`count(distinct ${promptAgentLinks.consumerAgentId})::int` })
    .from(promptAgentLinks)

  // Total pull count across all prompts owned by user
  const [pullsRow] = await db
    .select({ total: sql<number>`coalesce(sum(${agents.pullCount}), 0)::int` })
    .from(agents)
    .where(
      sql`${agents.ownerId} = ${user.id} AND (${agents.originalPrompt} IS NOT NULL OR ${agents.editedPrompt} IS NOT NULL)`
    )

  const promptIds = (
    await db
      .select({ id: agents.id })
      .from(agents)
      .where(
        sql`${agents.ownerId} = ${user.id} AND (${agents.originalPrompt} IS NOT NULL OR ${agents.editedPrompt} IS NOT NULL)`
      )
  ).map((row) => row.id)

  const deploymentRows = promptIds.length > 0
    ? await db
        .select({ status: agentDeployments.status })
        .from(agentDeployments)
        .where(inArray(agentDeployments.agentId, promptIds))
    : []

  return NextResponse.json({
    totalPrompts: promptsRow?.count ?? 0,
    totalAgents: agentsRow?.count ?? 0,
    agentsLinked: linkedRow?.count ?? 0,
    totalPulls: pullsRow?.total ?? 0,
    totalDeployments: deploymentRows.length,
    activeDeployments: deploymentRows.filter((row) => row.status === 'ready' || row.status === 'provisioning').length,
    errorDeployments: deploymentRows.filter((row) => row.status === 'error').length,
    runtimeEnabled: isOpenShellRuntimeEnabled(),
  })
}

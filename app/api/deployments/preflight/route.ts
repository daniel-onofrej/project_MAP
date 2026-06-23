export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { graphToPrompt } from '@/lib/graph/graph-to-prompt'
import type { AgentConfig } from '@/lib/types'
import { canEditAgent } from '@/lib/deployments/server'
import { normalizeDeploymentInput } from '@/lib/deployments/validation'
import { buildPreflightReport, buildRuntimeManifest } from '@/lib/deployments/manifest'
import { getRuntimeGatewayForUser } from '@/lib/deployments/gateways'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const input = normalizeDeploymentInput(await request.json())
    if (!(await canEditAgent(input.agentId, user))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, input.agentId))
      .limit(1)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const snapshot = {
      ...agent,
      settings: agent.settings ? { ...(agent.settings as Record<string, unknown>), apiKey: undefined } : {},
    } as unknown as AgentConfig
    snapshot.editedPrompt = agent.editedPrompt ?? agent.originalPrompt ?? graphToPrompt(snapshot)
    const manifestAgent = {
      ...snapshot,
      groupId: agent.groupId,
      currentVersionId: typeof agent.currentVersionId === 'string' ? agent.currentVersionId : null,
    } as AgentConfig & { groupId?: string | null; currentVersionId?: string | null }
    const gateway = await getRuntimeGatewayForUser(input.gatewayId, user)
    if (!gateway) return NextResponse.json({ error: 'Selected OpenShell gateway is not available' }, { status: 400 })
    const setup = await callDeploymentWorker('/setup')
    const credentialSources = setup.ok && setup.data && typeof setup.data === 'object'
      ? (setup.data as Record<string, any>).credentialSources
      : {}

    const { manifest, credentialValues } = buildRuntimeManifest({
      deploymentId: 'preflight',
      sandboxName: 'map-preflight',
      agent: manifestAgent,
      gatewayId: gateway.id,
      gateway: {
        id: gateway.id,
        endpoint: gateway.endpoint,
        mode: gateway.mode,
        label: gateway.label,
      },
      runtimeId: input.runtimeId,
      runtimeCommand: input.runtimeCommand,
      runtimePackage: input.runtimePackage,
      providers: input.providers,
      sandboxImage: input.sandboxImage,
      executionMode: input.executionMode,
      providerMode: input.providerMode,
      policyMode: input.policyMode,
      resources: input.resources,
      policyYaml: input.policyYaml,
      environment: input.environment,
    })
    const report = buildPreflightReport(manifestAgent, manifest, {
      credentialSources,
      providerCredentialValues: {
        ...credentialValues,
        ...input.providerCredentialValues,
      },
    })
    return NextResponse.json({ report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to preflight deployment'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import {
  createDeployment,
  listDeploymentsForUser,
  markDeploymentWorkerError,
} from '@/lib/deployments/server'
import { normalizeDeploymentInput } from '@/lib/deployments/validation'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'
import { isOpenShellRuntimeEnabled, openShellRuntimeDisabledResponse } from '@/lib/deployments/config'
import { writeAuditLog } from '@/lib/audit'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const deployments = await listDeploymentsForUser(user)
  return NextResponse.json({ deployments, runtimeEnabled: isOpenShellRuntimeEnabled() })
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!isOpenShellRuntimeEnabled()) return openShellRuntimeDisabledResponse()

  try {
    const input = normalizeDeploymentInput(await request.json())
    const setup = await callDeploymentWorker('/setup')
    const credentialSources = setup.ok && setup.data && typeof setup.data === 'object'
      ? (setup.data as Record<string, any>).credentialSources
      : {}
    const created = await createDeployment(input, user, { credentialSources })
    const deployment = created.deployment

    await writeAuditLog({
      agentId: deployment.agentId,
      userId: user.id,
      eventType: 'deployment_created',
      metadata: {
        deploymentId: deployment.id,
        sandbox: deployment.openshellSandboxName,
        runtimeKind: deployment.runtimeKind,
      },
    })

    void callDeploymentWorker(`/deployments/${deployment.id}/provision`, {
      method: 'POST',
      body: JSON.stringify({ providerCredentialValues: created.providerCredentialValues }),
    }).then(async (worker) => {
      if (!worker.ok) {
        await markDeploymentWorkerError(deployment.id, worker.error ?? 'Deployment worker failed')
      }
    })

    return NextResponse.json({
      deployment,
      provisioningStarted: true,
    }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create deployment'
    const status = message === 'Forbidden' ? 403 : message === 'Agent not found' ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

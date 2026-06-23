export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agentDeployments } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { isOpenShellRuntimeEnabled, openShellRuntimeDisabledResponse } from '@/lib/deployments/config'
import { addDeploymentEvent, canEditAgent, getDeploymentForUser, markDeploymentWorkerError } from '@/lib/deployments/server'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'
import { eq, sql } from 'drizzle-orm'

type Params = { id: string }

export async function POST(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isOpenShellRuntimeEnabled()) return openShellRuntimeDisabledResponse()

  const { id } = await params
  const deployment = await getDeploymentForUser(id, user)
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canEditAgent(deployment.agentId, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const policyYaml = typeof body.policyYaml === 'string' ? body.policyYaml.trim() : ''
  if (!policyYaml.includes('version:')) {
    return NextResponse.json({ error: 'Policy YAML must include a version field.' }, { status: 400 })
  }

  const worker = await callDeploymentWorker(`/deployments/${id}/policy`, {
    method: 'POST',
    body: JSON.stringify({ policyYaml }),
  })
  if (!worker.ok) {
    await markDeploymentWorkerError(id, worker.error ?? 'Deployment worker failed')
    return NextResponse.json({ error: worker.error ?? 'Deployment worker failed' }, { status: 502 })
  }

  const manifest = deployment.runtimeManifest && typeof deployment.runtimeManifest === 'object'
    ? { ...(deployment.runtimeManifest as Record<string, unknown>) }
    : {}
  manifest.policy = {
    ...((manifest.policy && typeof manifest.policy === 'object') ? manifest.policy as Record<string, unknown> : {}),
    yaml: policyYaml,
    mode: 'custom',
  }

  await db.update(agentDeployments)
    .set({
      policyYaml,
      runtimeManifest: manifest,
      policyRevision: sql`${agentDeployments.policyRevision} + 1`,
      lastLog: JSON.stringify(worker.data ?? {}),
    })
    .where(eq(agentDeployments.id, id))
  await addDeploymentEvent({
    deploymentId: id,
    eventType: 'policy_updated',
    message: 'OpenShell policy updated.',
    metadata: { dynamic: true },
  })

  const updated = await getDeploymentForUser(id, user)
  return NextResponse.json({ deployment: updated, worker: worker.data })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { deploymentProviders } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { isOpenShellRuntimeEnabled, openShellRuntimeDisabledResponse } from '@/lib/deployments/config'
import { addDeploymentEvent, canEditAgent, getDeploymentForUser, markDeploymentWorkerError } from '@/lib/deployments/server'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'
import { and, eq } from 'drizzle-orm'

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
  const providerName = typeof body.providerName === 'string' ? body.providerName.trim() : ''
  if (!providerName) return NextResponse.json({ error: 'providerName is required' }, { status: 400 })

  const worker = await callDeploymentWorker(`/deployments/${id}/providers/attach`, {
    method: 'POST',
    body: JSON.stringify({ providerName }),
  })
  if (!worker.ok) {
    await markDeploymentWorkerError(id, worker.error ?? 'Deployment worker failed')
    return NextResponse.json({ error: worker.error ?? 'Deployment worker failed' }, { status: 502 })
  }

  await db.update(deploymentProviders)
    .set({ attachStatus: 'attached', lastVerifiedAt: new Date() })
    .where(and(eq(deploymentProviders.deploymentId, id), eq(deploymentProviders.providerName, providerName)))
  await addDeploymentEvent({
    deploymentId: id,
    eventType: 'provider_attached',
    message: `Provider ${providerName} attached.`,
    metadata: { providerName },
  })

  const updated = await getDeploymentForUser(id, user)
  return NextResponse.json({ deployment: updated, worker: worker.data })
}

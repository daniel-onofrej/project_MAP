export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { isOpenShellRuntimeEnabled, openShellRuntimeDisabledResponse } from '@/lib/deployments/config'
import { canEditAgent, getDeploymentForUser, markDeploymentWorkerError } from '@/lib/deployments/server'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'

type Params = { id: string }

export async function POST(_request: Request, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isOpenShellRuntimeEnabled()) return openShellRuntimeDisabledResponse()

  const { id } = await params
  const deployment = await getDeploymentForUser(id, user)
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canEditAgent(deployment.agentId, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const worker = await callDeploymentWorker(`/deployments/${id}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!worker.ok) {
    await markDeploymentWorkerError(id, worker.error ?? 'Deployment worker failed')
    return NextResponse.json({ error: worker.error ?? 'Deployment worker failed' }, { status: 502 })
  }

  const updated = await getDeploymentForUser(id, user)
  return NextResponse.json({ deployment: updated })
}

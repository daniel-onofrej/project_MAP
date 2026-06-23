export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/db'
import { agentDeployments } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { isOpenShellRuntimeEnabled, openShellRuntimeDisabledResponse } from '@/lib/deployments/config'
import { getDeploymentForUser } from '@/lib/deployments/server'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'
import { writeAuditLog } from '@/lib/audit'
import { eq } from 'drizzle-orm'

type Params = { id: string }

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const deployment = await getDeploymentForUser(id, user)
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ deployment, runtimeEnabled: isOpenShellRuntimeEnabled() })
}

export async function DELETE(_request: Request, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!isOpenShellRuntimeEnabled()) return openShellRuntimeDisabledResponse()

  const { id } = await params
  const deployment = await getDeploymentForUser(id, user)
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db
    .update(agentDeployments)
    .set({ status: 'deleting' })
    .where(eq(agentDeployments.id, id))

  const worker = await callDeploymentWorker(`/deployments/${id}`, { method: 'DELETE' })
  if (!worker.ok) {
    await db
      .update(agentDeployments)
      .set({ status: 'error', lastError: worker.error ?? 'Deployment worker failed' })
      .where(eq(agentDeployments.id, id))
    return NextResponse.json({ error: worker.error ?? 'Deployment worker failed' }, { status: 502 })
  }

  await writeAuditLog({
    agentId: deployment.agentId,
    userId: user.id,
    eventType: 'deployment_deleted',
    metadata: { deploymentId: id, sandbox: deployment.openshellSandboxName },
  })

  await db.delete(agentDeployments).where(eq(agentDeployments.id, id))
  return NextResponse.json({ ok: true })
}

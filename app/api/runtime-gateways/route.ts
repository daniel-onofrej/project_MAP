export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { createRuntimeGatewayForUser, listRuntimeGatewaysForUser } from '@/lib/deployments/gateways'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'
import { isOpenShellRuntimeEnabled } from '@/lib/deployments/config'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gateways = await listRuntimeGatewaysForUser(user)
  return NextResponse.json({ gateways })
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const gateway = await createRuntimeGatewayForUser(await request.json().catch(() => ({})), user)
    const verification = isOpenShellRuntimeEnabled()
      ? await callDeploymentWorker('/gateways/verify', {
        method: 'POST',
        body: JSON.stringify({ gatewayId: gateway.id }),
      })
      : { ok: false, error: 'OpenShell runtime is disabled' }

    return NextResponse.json({
      gateway,
      verification: verification.ok ? verification.data : { error: verification.error },
    }, { status: 201 })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to create gateway',
    }, { status: 400 })
  }
}

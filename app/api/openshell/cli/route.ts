export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { isOpenShellRuntimeEnabled, openShellRuntimeDisabledResponse } from '@/lib/deployments/config'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'
import { cleanTerminalOutput } from '@/lib/terminal-output'

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!isOpenShellRuntimeEnabled()) return openShellRuntimeDisabledResponse()

  const body = await request.json().catch(() => ({}))
  const command = typeof body.command === 'string' ? body.command.trim() : ''
  if (!command) return NextResponse.json({ error: 'Command is required' }, { status: 400 })

  const worker = await callDeploymentWorker<{ command: string; output: string }>('/openshell/command', {
    method: 'POST',
    body: JSON.stringify({ command }),
  })

  if (!worker.ok) {
    return NextResponse.json({ error: worker.error ?? 'OpenShell command failed' }, { status: 502 })
  }

  return NextResponse.json({
    ...worker.data,
    output: cleanTerminalOutput(worker.data?.output),
  })
}

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { RUNTIME_CATALOG, PROVIDER_CATALOG } from '@/lib/deployments/catalog'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'
import { isOpenShellRuntimeEnabled } from '@/lib/deployments/config'
import { listRuntimeGatewaysForUser } from '@/lib/deployments/gateways'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setup = isOpenShellRuntimeEnabled()
    ? await callDeploymentWorker('/setup')
    : { ok: false, error: 'OpenShell runtime is disabled' }
  const gateways = await listRuntimeGatewaysForUser(user)
  const workerCredentialSources = setup.ok && setup.data && typeof setup.data === 'object'
    ? (setup.data as Record<string, any>).credentialSources
    : {}
  const credentialSources: Record<string, { present: boolean; usedBy: string[] }> = {}
  for (const provider of PROVIDER_CATALOG) {
    for (const key of provider.credentialKeys) {
      const existing = credentialSources[key] ?? {
        present: Boolean(workerCredentialSources?.[key]?.present),
        usedBy: [],
      }
      existing.usedBy.push(provider.label)
      credentialSources[key] = existing
    }
  }
  for (const [key, value] of Object.entries(workerCredentialSources ?? {})) {
    if (!credentialSources[key]) {
      credentialSources[key] = {
        present: Boolean((value as { present?: boolean })?.present),
        usedBy: [],
      }
    }
  }

  return NextResponse.json({
    runtimes: RUNTIME_CATALOG,
    providers: PROVIDER_CATALOG,
    gateways,
    credentialSources,
    runtimeEnabled: isOpenShellRuntimeEnabled(),
    setup: setup.ok ? setup.data : { error: setup.error },
  })
}

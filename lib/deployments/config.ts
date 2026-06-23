import { NextResponse } from 'next/server'

export const OPENSHELL_RUNTIME_DISABLED_MESSAGE =
  'OpenShell runtime is disabled. Set OPENSHELL_RUNTIME_ENABLED=true to enable sandbox operations.'

export function isOpenShellRuntimeEnabled() {
  return process.env.OPENSHELL_RUNTIME_ENABLED !== 'false'
}

export function openShellRuntimeDisabledResponse() {
  return NextResponse.json({ error: OPENSHELL_RUNTIME_DISABLED_MESSAGE }, { status: 503 })
}

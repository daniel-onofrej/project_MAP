export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { isOpenShellRuntimeEnabled, openShellRuntimeDisabledResponse } from '@/lib/deployments/config'
import {
  addDeploymentMessage,
  canEditAgent,
  getDeploymentForUser,
  markDeploymentWorkerError,
} from '@/lib/deployments/server'
import { callDeploymentWorker } from '@/lib/deployments/worker-client'
import { cleanTerminalOutput } from '@/lib/terminal-output'
import { resolveApiKeyForAgent, type Provider } from '@/lib/api-keys'

type Params = { id: string }

type RuntimeTrace = {
  type: string
  message: string
  toolName?: string
  command?: string
  sourcePath?: string
  output?: string
  durationMs?: number
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchingToolMessages(deployment: NonNullable<Awaited<ReturnType<typeof getDeploymentForUser>>>, output: string) {
  const tools = deployment.runtimePackage.tools ?? []
  if (!output.trim() || tools.length === 0) return []

  return tools.flatMap((tool) => {
    const name = String(tool.name || '').trim()
    if (!name) return []
    const matched = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(output)
    if (!matched) return []

    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(line))
      .slice(0, 4)

    return [{
      toolName: name,
      command: tool.command,
      sourcePath: tool.sourcePath,
      content: [
        `${name} used`,
        tool.command ? `command: ${tool.command}` : '',
        tool.sourcePath ? `file: /sandbox/map/${tool.sourcePath}` : '',
        lines.length > 0 ? `observed output: ${lines.join('\n')}` : '',
      ].filter(Boolean).join('\n'),
    }]
  })
}

function traceString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function normalizeRuntimeTraces(value: unknown): RuntimeTrace[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const record = entry as Record<string, unknown>
    const message = traceString(record.message, 1000)
    if (!message) return []
    const durationMs = typeof record.durationMs === 'number' && Number.isFinite(record.durationMs)
      ? record.durationMs
      : undefined
    return [{
      type: traceString(record.type, 40) ?? 'thinking',
      message,
      toolName: traceString(record.toolName, 120),
      command: traceString(record.command, 500),
      sourcePath: traceString(record.sourcePath, 500),
      output: traceString(record.output, 4000),
      durationMs,
    }]
  })
}

function toolMessageFromTrace(trace: RuntimeTrace) {
  const toolName = trace.toolName ?? 'Tool'
  const content = [
    `${toolName} used`,
    trace.command ? `command: ${trace.command}` : '',
    trace.sourcePath ? `file: /sandbox/map/${trace.sourcePath}` : '',
    trace.output ? `observed output: ${cleanTerminalOutput(trace.output)}` : '',
  ].filter(Boolean).join('\n')
  return { toolName, content }
}

const CREDENTIAL_PROVIDER: Record<string, Provider> = {
  GEMINI_API_KEY: 'gemini',
  GOOGLE_GENERATIVE_AI_API_KEY: 'gemini',
  OPENAI_API_KEY: 'openai',
  ANTHROPIC_API_KEY: 'anthropic',
  GROQ_API_KEY: 'groq',
}

async function resolveDeploymentProviderCredentials(
  deployment: NonNullable<Awaited<ReturnType<typeof getDeploymentForUser>>>,
) {
  const values: Record<string, Record<string, string>> = {}
  for (const provider of deployment.providers ?? []) {
    const bag: Record<string, string> = {}
    for (const credentialKey of provider.credentialKeys ?? []) {
      const mappedProvider = CREDENTIAL_PROVIDER[credentialKey]
      if (!mappedProvider) continue
      const key = await resolveApiKeyForAgent(mappedProvider, deployment.agentId)
      if (key) bag[credentialKey] = key
    }
    if (Object.keys(bag).length > 0) values[provider.providerName] = bag
  }
  return values
}

function normalizeProviderCredentialValues(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const normalized: Record<string, Record<string, string>> = {}
  for (const [providerName, bag] of Object.entries(value)) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue
    const credentials = Object.fromEntries(
      Object.entries(bag)
        .map(([key, secret]) => [key.trim(), String(secret)] as const)
        .filter(([key, secret]) => key && secret),
    )
    if (Object.keys(credentials).length > 0) normalized[providerName] = credentials
  }
  return normalized
}

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
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  const explicitProviderCredentialValues = normalizeProviderCredentialValues(body.providerCredentialValues)
  const providerCredentialValues = {
    ...(await resolveDeploymentProviderCredentials(deployment)),
    ...explicitProviderCredentialValues,
  }

  await addDeploymentMessage({ deploymentId: id, role: 'user', content: message })
  const history = [
    ...deployment.messages,
    { role: 'user' as const, content: message, status: 'success' as const, metadata: {}, createdAt: new Date().toISOString() },
  ]
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant' || entry.role === 'tool')
    .slice(-16)
    .map((entry) => ({
      role: entry.role,
      content: entry.content.slice(0, 4000),
      createdAt: entry.createdAt,
    }))
  const worker = await callDeploymentWorker<{ output?: string; durationMs?: number; traces?: unknown }>(
    `/deployments/${id}/chat`,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
        history,
        providerCredentialValues,
      }),
    },
  )

  if (!worker.ok) {
    const error = worker.error ?? 'Deployment worker failed'
    await addDeploymentMessage({ deploymentId: id, role: 'assistant', content: error, status: 'error' })
    await markDeploymentWorkerError(id, error)
    return NextResponse.json({ error }, { status: 502 })
  }

  const output = cleanTerminalOutput(worker.data?.output)
  const traces = normalizeRuntimeTraces(worker.data?.traces)
  const tokenMetadata = {
    durationMs: worker.data?.durationMs,
    estimatedTokens: {
      input: estimateTokens(message),
      output: output ? estimateTokens(output) : 0,
      pinnedPrompt: estimateTokens(deployment.pinnedPrompt ?? ''),
      runtimePackage: estimateTokens(JSON.stringify(deployment.runtimePackage ?? {})),
    },
  }
  let hasTraceToolMessages = false
  for (const trace of traces) {
    const traceType = trace.type.toLowerCase()
    if (traceType === 'thinking' || traceType === 'tool_call') {
      await addDeploymentMessage({
        deploymentId: id,
        role: 'thinking',
        content: trace.message,
        metadata: {
          traceType,
          toolName: trace.toolName,
          command: trace.command,
          sourcePath: trace.sourcePath,
          durationMs: trace.durationMs,
          estimatedTokens: {
            output: estimateTokens(trace.message),
          },
        },
      })
      continue
    }

    if (traceType === 'tool_result') {
      hasTraceToolMessages = true
      const tool = toolMessageFromTrace(trace)
      await addDeploymentMessage({
        deploymentId: id,
        role: 'tool',
        content: tool.content,
        metadata: {
          traceType,
          toolName: tool.toolName,
          command: trace.command,
          sourcePath: trace.sourcePath,
          durationMs: trace.durationMs,
          estimatedTokens: {
            output: estimateTokens(tool.content),
          },
        },
      })
    }
  }

  const toolMessages = hasTraceToolMessages ? [] : matchingToolMessages(deployment, output)
  for (const tool of toolMessages) {
    await addDeploymentMessage({
      deploymentId: id,
      role: 'tool',
      content: tool.content,
      metadata: {
        toolName: tool.toolName,
        command: tool.command,
        sourcePath: tool.sourcePath,
        durationMs: worker.data?.durationMs,
      },
    })
  }
  await addDeploymentMessage({
    deploymentId: id,
    role: 'assistant',
    content: output || '(no output)',
    metadata: tokenMetadata,
  })

  const updated = await getDeploymentForUser(id, user)
  return NextResponse.json({ deployment: updated, output })
}

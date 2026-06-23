import { db } from '@/db'
import {
  agentDeployments,
  agents,
  agentShares,
  deploymentEvents,
  deploymentMessages,
  deploymentProviders,
  groupMembers,
  mcpTokens,
} from '@/db/schema'
import { graphToPrompt } from '@/lib/graph/graph-to-prompt'
import type { AgentConfig } from '@/lib/types'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { cleanTerminalOutput } from '@/lib/terminal-output'
import { createHash, randomBytes } from 'crypto'
import type {
  DeploymentDetail,
  DeploymentEvent,
  DeploymentProvider,
  DeploymentSummary,
  RuntimeProviderInput,
} from './types'
import type { NormalizedDeploymentInput } from './validation'
import { buildPreflightReport, buildRuntimeManifest } from './manifest'
import { getRuntimeGatewayForUser } from './gateways'
import { normalizeRuntimePackage } from '@/lib/runtime-assets'

type SessionUserLike = {
  id: string
  role: 'admin' | 'editor' | 'viewer'
  name?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function cleanNullable(value: string | null | undefined): string | null {
  return value ? cleanTerminalOutput(value) || null : null
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function summarize(row: typeof agentDeployments.$inferSelect & { agentName?: string }): DeploymentSummary {
  return {
    id: row.id,
    name: row.name,
    agentId: row.agentId,
    agentName: row.agentName,
    status: row.status,
    openshellSandboxName: row.openshellSandboxName,
    runtimeKind: row.runtimeKind,
    runtimeCommand: row.runtimeCommand,
    manifestVersion: row.manifestVersion ?? 1,
    runtimeId: (row.runtimeId ?? row.runtimeKind) as DeploymentSummary['runtimeId'],
    sandboxImage: row.sandboxImage ?? 'base',
    executionMode: (row.executionMode ?? 'oneshot') as DeploymentSummary['executionMode'],
    providerMode: (row.providerMode ?? 'legacy-env') as DeploymentSummary['providerMode'],
    gatewayId: row.gatewayId ?? 'map',
    preflightReport: normalizeJsonObject(row.preflightReport),
    policyRevision: row.policyRevision ?? 1,
    observedPhase: row.observedPhase ?? null,
    runtimeManifest: normalizeJsonObject(row.runtimeManifest),
    runtimePackage: normalizeRuntimePackage(row.runtimePackage),
    createdBy: row.createdBy,
    groupId: row.groupId,
    lastError: cleanNullable(row.lastError),
    lastLog: cleanNullable(row.lastLog),
    deployedAt: iso(row.deployedAt),
    stoppedAt: iso(row.stoppedAt),
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
  }
}

function mapProvider(row: typeof deploymentProviders.$inferSelect): DeploymentProvider {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    providerName: row.providerName,
    providerType: row.providerType,
    role: row.role as DeploymentProvider['role'],
    credentialKeys: row.credentialKeys,
    attachStatus: row.attachStatus,
    configSnapshot: normalizeJsonObject(row.configSnapshot),
    lastVerifiedAt: iso(row.lastVerifiedAt),
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
  }
}

function mapEvent(row: typeof deploymentEvents.$inferSelect): DeploymentEvent {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    eventType: row.eventType as DeploymentEvent['eventType'],
    message: cleanNullable(row.message),
    metadata: normalizeJsonObject(row.metadata),
    createdAt: iso(row.createdAt)!,
  }
}

export async function canEditAgent(agentId: string, user: SessionUserLike): Promise<boolean> {
  if (user.role === 'viewer') return false
  if (user.role === 'admin') return true

  const [agent] = await db
    .select({ ownerId: agents.ownerId, groupId: agents.groupId })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1)
  if (!agent) return false
  if (agent.ownerId === user.id) return true

  if (agent.groupId) {
    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, agent.groupId), eq(groupMembers.userId, user.id)))
      .limit(1)
    if (membership && membership.role !== 'viewer') return true
  }

  const [share] = await db
    .select({ permission: agentShares.permission })
    .from(agentShares)
    .where(and(eq(agentShares.agentId, agentId), eq(agentShares.userId, user.id)))
    .limit(1)
  return share?.permission === 'edit'
}

export async function listDeploymentsForUser(user: SessionUserLike): Promise<DeploymentSummary[]> {
  const userGroupIds = (
    await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id))
  ).map((r) => r.groupId)

  const sharedAgentIds = (
    await db
      .select({ agentId: agentShares.agentId })
      .from(agentShares)
      .where(eq(agentShares.userId, user.id))
  ).map((r) => r.agentId)

  const accessConditions = user.role === 'admin'
    ? []
    : [
        eq(agents.ownerId, user.id),
        eq(agents.isPublicInOrg, true),
        ...(userGroupIds.length > 0 ? [inArray(agents.groupId, userGroupIds)] : []),
        ...(sharedAgentIds.length > 0 ? [inArray(agents.id, sharedAgentIds)] : []),
      ]

  let query = db
    .select({ deployment: agentDeployments, agentName: agents.name })
    .from(agentDeployments)
    .innerJoin(agents, eq(agentDeployments.agentId, agents.id))

  if (accessConditions.length > 0) {
    query = query.where(or(...accessConditions)) as typeof query
  }

  const rows = await query.orderBy(desc(agentDeployments.updatedAt))
  const summaries = rows.map((row) => summarize({ ...row.deployment, agentName: row.agentName }))
  if (summaries.length === 0) return summaries

  const providers = await db
    .select()
    .from(deploymentProviders)
    .where(inArray(deploymentProviders.deploymentId, summaries.map((deployment) => deployment.id)))
  const providersByDeployment = new Map<string, DeploymentProvider[]>()
  for (const provider of providers) {
    const list = providersByDeployment.get(provider.deploymentId) ?? []
    list.push(mapProvider(provider))
    providersByDeployment.set(provider.deploymentId, list)
  }

  return summaries.map((summary) => ({
    ...summary,
    providers: providersByDeployment.get(summary.id) ?? [],
  }))
}

export async function getDeploymentForUser(
  deploymentId: string,
  user: SessionUserLike,
): Promise<DeploymentDetail | null> {
  const list = await listDeploymentsForUser(user)
  const summary = list.find((deployment) => deployment.id === deploymentId)
  if (!summary) return null

  const [deployment] = await db
    .select()
    .from(agentDeployments)
    .where(eq(agentDeployments.id, deploymentId))
    .limit(1)
  if (!deployment) return null

  const messages = await db
    .select()
    .from(deploymentMessages)
    .where(eq(deploymentMessages.deploymentId, deploymentId))
    .orderBy(deploymentMessages.createdAt)
  const providers = await db
    .select()
    .from(deploymentProviders)
    .where(eq(deploymentProviders.deploymentId, deploymentId))
  const events = await db
    .select()
    .from(deploymentEvents)
    .where(eq(deploymentEvents.deploymentId, deploymentId))
    .orderBy(desc(deploymentEvents.createdAt))

  return {
    ...summary,
    providers: providers.map(mapProvider),
    events: events.slice(0, 100).map(mapEvent),
    policyYaml: deployment.policyYaml,
    pinnedPrompt: deployment.pinnedPrompt,
    pinnedSnapshot: deployment.pinnedSnapshot,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: cleanTerminalOutput(message.content),
      status: message.status,
      metadata: message.metadata as Record<string, unknown>,
      createdAt: iso(message.createdAt)!,
    })),
  }
}

export type DeploymentCreateResult = {
  deployment: DeploymentSummary
  providerCredentialValues: Record<string, Record<string, string>>
}

function createRawMcpToken(): string {
  return `verto_${randomBytes(16).toString('hex')}`
}

function buildDeploymentMcpProvider(deploymentId: string): { provider: RuntimeProviderInput; providerName: string } {
  const providerName = `map-mcp-${deploymentId}`.toLowerCase()
  return {
    providerName,
    provider: {
      id: 'map-mcp',
      name: providerName,
      type: 'generic',
      role: 'mcp',
      mode: 'providers-v2',
      credentialKeys: ['MCP_AUTH_TOKEN'],
      env: {
        MCP_INTERNAL_URL: process.env.MCP_INTERNAL_URL || 'http://mcp-server:3100/mcp',
      },
      sourceEnv: {
        MCP_AUTH_TOKEN: 'MCP_AUTH_TOKEN',
      },
      endpoints: [
        {
          name: 'MAP MCP',
          target: process.env.MCP_INTERNAL_URL || 'http://mcp-server:3100/mcp',
          direction: 'outbound',
          description: 'Deployment-scoped MAP MCP access',
        },
      ],
      attach: true,
      useForInference: false,
    },
  }
}

async function createDeploymentMcpToken(params: {
  deploymentId: string
  userId: string
  groupId: string | null
}): Promise<string> {
  const token = createRawMcpToken()
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const tokenPrefix = token.slice(0, 8)
  await db.insert(mcpTokens).values({
    name: `Runtime ${params.deploymentId}`,
    tokenHash,
    tokenPrefix,
    scopes: params.groupId ? [params.groupId] : ['*'],
    createdBy: params.userId,
    expiresAt: null,
  })
  return token
}

export async function createDeployment(
  input: NormalizedDeploymentInput,
  user: SessionUserLike,
  options: { credentialSources?: Record<string, { present?: boolean; usedBy?: string[] }> } = {},
): Promise<DeploymentCreateResult> {
  if (!(await canEditAgent(input.agentId, user))) {
    throw new Error('Forbidden')
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1)
  if (!agent) throw new Error('Agent not found')

  const snapshot = {
    ...agent,
    settings: agent.settings ? { ...(agent.settings as Record<string, unknown>), apiKey: undefined } : {},
  } as unknown as AgentConfig
  const pinnedPrompt = agent.editedPrompt ?? agent.originalPrompt ?? graphToPrompt(snapshot)
  const id = nanoid()
  const sandboxName = `map-${id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const currentVersionId = typeof agent.currentVersionId === 'string' && UUID_RE.test(agent.currentVersionId)
    ? agent.currentVersionId
    : null
  const mcpProvider = buildDeploymentMcpProvider(id)
  const gateway = await getRuntimeGatewayForUser(input.gatewayId, user)
  if (!gateway) throw new Error('Selected OpenShell gateway is not available.')
  const providerInputs: RuntimeProviderInput[] = [...input.providers, mcpProvider.provider]
  const agentForManifest = {
    ...snapshot,
    groupId: agent.groupId,
    currentVersionId,
  } as AgentConfig & { groupId?: string | null; currentVersionId?: string | null }
  const { manifest, credentialValues } = buildRuntimeManifest({
    deploymentId: id,
    sandboxName,
    agent: agentForManifest,
    gatewayId: gateway.id,
    gateway: {
      id: gateway.id,
      endpoint: gateway.endpoint,
      mode: gateway.mode,
      label: gateway.label,
    },
    runtimeId: input.runtimeId,
    runtimeCommand: input.runtimeCommand,
    runtimePackage: input.runtimePackage,
    providers: providerInputs,
    sandboxImage: input.sandboxImage,
    executionMode: input.executionMode,
    providerMode: input.providerMode,
    policyMode: input.policyMode,
    resources: input.resources,
    policyYaml: input.policyYaml,
    environment: input.environment,
  })
  const providerCredentialValues = {
    ...credentialValues,
    ...input.providerCredentialValues,
  }
  const preflightReport = buildPreflightReport(agentForManifest, manifest, {
    credentialSources: options.credentialSources,
    providerCredentialValues,
  })
  if (!preflightReport.ok) {
    throw new Error(`Preflight failed: ${preflightReport.checks.filter((item) => item.status === 'fail').map((item) => item.message).join(' ')}`)
  }
  const mcpToken = await createDeploymentMcpToken({
    deploymentId: id,
    userId: user.id,
    groupId: agent.groupId,
  })

  const [created] = await db
    .insert(agentDeployments)
    .values({
      id,
      agentId: agent.id,
      agentVersionId: currentVersionId,
      name: input.name,
      status: 'pending',
      openshellSandboxName: sandboxName,
      runtimeKind: input.runtimeKind,
      runtimeCommand: input.runtimeCommand,
      runtimePackage: manifest.package,
      manifestVersion: 2,
      runtimeId: manifest.runtime.id,
      sandboxImage: manifest.runtime.image,
      executionMode: manifest.runtime.executionMode,
      providerMode: manifest.security.providerMode,
      gatewayId: manifest.gateway.id,
      preflightReport,
      policyRevision: 1,
      observedPhase: 'pending',
      runtimeManifest: manifest,
      policyYaml: manifest.policy.yaml,
      pinnedSnapshot: snapshot,
      pinnedPrompt,
      createdBy: user.id,
      groupId: agent.groupId,
    })
    .returning()

  if (manifest.providers.length > 0) {
    await db.insert(deploymentProviders).values(manifest.providers.map((provider) => ({
      deploymentId: id,
      providerName: provider.name,
      providerType: provider.type,
      role: provider.role,
      credentialKeys: provider.credentialKeys,
      attachStatus: 'pending' as const,
      configSnapshot: {
        id: provider.id,
        mode: provider.mode,
        env: provider.env,
        config: provider.config,
        sourceEnv: provider.sourceEnv,
        endpoints: provider.endpoints,
        attach: provider.attach,
        useForInference: provider.useForInference,
      },
    })))
  }

  await addDeploymentEvent({
    deploymentId: id,
    eventType: 'created',
    message: 'Deployment created and prompt snapshot pinned.',
    metadata: { runtimeId: manifest.runtime.id, sandboxImage: manifest.runtime.image, gatewayId: manifest.gateway.id },
  })
  await addDeploymentEvent({
    deploymentId: id,
    eventType: 'preflight',
    message: preflightReport.ok ? 'Preflight passed.' : 'Preflight has blocking issues.',
    metadata: { checks: preflightReport.checks, ok: preflightReport.ok },
  })

  return {
    deployment: summarize({ ...created, agentName: agent.name }),
    providerCredentialValues: {
      ...providerCredentialValues,
      [mcpProvider.providerName]: { MCP_AUTH_TOKEN: mcpToken },
    },
  }
}

export async function addDeploymentMessage(params: {
  deploymentId: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'thinking'
  content: string
  status?: 'pending' | 'success' | 'error'
  metadata?: Record<string, unknown>
}) {
  const [message] = await db
    .insert(deploymentMessages)
    .values({
      deploymentId: params.deploymentId,
      role: params.role,
      content: params.content,
      status: params.status ?? 'success',
      metadata: params.metadata ?? {},
    })
    .returning()
  return message
}

export async function addDeploymentEvent(params: {
  deploymentId: string
  eventType: DeploymentEvent['eventType']
  message?: string
  metadata?: Record<string, unknown>
}) {
  const [event] = await db
    .insert(deploymentEvents)
    .values({
      deploymentId: params.deploymentId,
      eventType: params.eventType,
      message: params.message ?? null,
      metadata: params.metadata ?? {},
    })
    .returning()
  return event
}

export async function markDeploymentWorkerError(deploymentId: string, error: string): Promise<void> {
  await db
    .update(agentDeployments)
    .set({ status: 'error', lastError: error })
    .where(eq(agentDeployments.id, deploymentId))
  await addDeploymentEvent({
    deploymentId,
    eventType: 'error',
    message: error,
    metadata: { source: 'worker' },
  }).catch(() => {})
}

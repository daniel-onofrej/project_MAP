import { db } from '@/db'
import { groupMembers, runtimeGateways } from '@/db/schema'
import { GATEWAY_CATALOG, getGatewayTemplate } from './catalog'
import type { RuntimeGatewayProfile } from './types'
import { desc, eq, inArray, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'

type SessionUserLike = {
  id: string
  role: 'admin' | 'editor' | 'viewer'
}

const GATEWAY_MODES = ['local-docker', 'remote-docker', 'kubernetes', 'custom'] as const
const AUTH_MODES = ['local', 'mtls', 'token', 'custom'] as const

function cleanString(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function gatewayMode(value: unknown): RuntimeGatewayProfile['mode'] {
  return GATEWAY_MODES.includes(value as RuntimeGatewayProfile['mode'])
    ? value as RuntimeGatewayProfile['mode']
    : 'custom'
}

function authMode(value: unknown): NonNullable<RuntimeGatewayProfile['authMode']> {
  return AUTH_MODES.includes(value as NonNullable<RuntimeGatewayProfile['authMode']>)
    ? value as NonNullable<RuntimeGatewayProfile['authMode']>
    : 'local'
}

function validateEndpoint(value: unknown): string {
  const endpoint = cleanString(value, 500).replace(/\/+$/, '')
  if (!endpoint) throw new Error('Gateway endpoint is required.')
  try {
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol')
    return endpoint
  } catch {
    throw new Error('Gateway endpoint must be an http(s) URL.')
  }
}

function mapRuntimeGateway(row: typeof runtimeGateways.$inferSelect): RuntimeGatewayProfile {
  return {
    id: row.id,
    label: row.name,
    endpoint: row.endpoint,
    mode: row.mode as RuntimeGatewayProfile['mode'],
    description: row.description ?? '',
    authMode: row.authMode as RuntimeGatewayProfile['authMode'],
    status: row.status as RuntimeGatewayProfile['status'],
    groupId: row.groupId,
    createdBy: row.createdBy,
    lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
    lastError: row.lastError,
  }
}

export async function listRuntimeGatewaysForUser(user: SessionUserLike): Promise<RuntimeGatewayProfile[]> {
  const builtIns = GATEWAY_CATALOG.map((gateway) => ({
    ...gateway,
    status: 'unknown' as const,
    authMode: 'local' as const,
  }))

  const groupIds = (
    await db.select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id))
  ).map((row) => row.groupId)

  const rows = user.role === 'admin'
    ? await db.select().from(runtimeGateways).orderBy(desc(runtimeGateways.updatedAt))
    : await db
      .select()
      .from(runtimeGateways)
      .where(or(
        eq(runtimeGateways.createdBy, user.id),
        ...(groupIds.length > 0 ? [inArray(runtimeGateways.groupId, groupIds)] : []),
      ))
      .orderBy(desc(runtimeGateways.updatedAt))

  return [...builtIns, ...rows.map(mapRuntimeGateway)]
}

export async function getRuntimeGatewayForUser(id: string, user: SessionUserLike): Promise<RuntimeGatewayProfile | null> {
  const builtIn = GATEWAY_CATALOG.find((gateway) => gateway.id === id)
  if (builtIn) return { ...builtIn, authMode: 'local', status: 'unknown' }

  const gateways = await listRuntimeGatewaysForUser(user)
  return gateways.find((gateway) => gateway.id === id) ?? null
}

export async function createRuntimeGatewayForUser(input: Record<string, unknown>, user: SessionUserLike): Promise<RuntimeGatewayProfile> {
  if (user.role === 'viewer') throw new Error('Forbidden')

  const name = cleanString(input.name ?? input.label, 120)
  if (!name) throw new Error('Gateway name is required.')
  const endpoint = validateEndpoint(input.endpoint)
  const mode = gatewayMode(input.mode)
  const selectedAuthMode = authMode(input.authMode)
  const description = cleanString(input.description, 500)
  const requestedGroupId = cleanString(input.groupId, 80)
  const groupIds = (
    await db.select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id))
  ).map((row) => row.groupId)
  const groupId = requestedGroupId && (user.role === 'admin' || groupIds.includes(requestedGroupId))
    ? requestedGroupId
    : null

  const id = `gw-${nanoid(12)}`.toLowerCase()
  const [created] = await db.insert(runtimeGateways).values({
    id,
    name,
    endpoint,
    mode,
    authMode: selectedAuthMode,
    description,
    config: {},
    status: 'unknown',
    createdBy: user.id,
    groupId,
  }).returning()

  return mapRuntimeGateway(created)
}

export function fallbackGateway(id: unknown): RuntimeGatewayProfile {
  return getGatewayTemplate(id)
}

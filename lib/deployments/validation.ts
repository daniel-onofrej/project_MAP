import {
  EXECUTION_MODES,
  POLICY_MODES,
  PROVIDER_MODES,
  RUNTIME_KINDS,
  type ExecutionMode,
  type PolicyMode,
  type ProviderMode,
  type RuntimeId,
  type RuntimeKind,
  type RuntimePackage,
  type RuntimeProviderInput,
  type RuntimeResourceLimits,
} from './types'
import { runtimeIdFromKind } from './catalog'
import { normalizeRuntimePackage } from '../runtime-assets'

export type DeploymentValidationInput = {
  name?: unknown
  agentId?: unknown
  runtimeKind?: unknown
  runtimeCommand?: unknown
  runtimePackage?: unknown
  policyYaml?: unknown
  runtimeId?: unknown
  gatewayId?: unknown
  sandboxImage?: unknown
  executionMode?: unknown
  providerMode?: unknown
  policyMode?: unknown
  advancedAcknowledgements?: unknown
  providers?: unknown
  resources?: unknown
  environment?: unknown
}

export type NormalizedDeploymentInput = {
  name: string
  agentId: string
  runtimeKind: RuntimeKind
  runtimeCommand: string
  runtimePackage: RuntimePackage
  policyYaml: string
  runtimeId: RuntimeId
  gatewayId: string
  sandboxImage: string
  executionMode: ExecutionMode
  providerMode: ProviderMode
  policyMode: PolicyMode
  advancedAcknowledgements: string[]
  providers: RuntimeProviderInput[]
  providerCredentialValues: Record<string, Record<string, string>>
  resources: RuntimeResourceLimits
  environment: Record<string, string>
}

function cleanString(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanEnvRecord(value: unknown, maxValueLength = 2000): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [
        key.trim().replace(/[^A-Z0-9_]/gi, '_').slice(0, 100),
        cleanString(val, maxValueLength),
      ] as const)
      .filter(([key, val]) => key && val),
  )
}

function cleanIdentifier(value: unknown, fallback = 'map'): string {
  const clean = cleanString(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || fallback
}

function normalizeProviders(value: unknown): {
  providers: RuntimeProviderInput[]
  providerCredentialValues: Record<string, Record<string, string>>
} {
  if (!Array.isArray(value)) return { providers: [], providerCredentialValues: {} }

  const providerCredentialValues: Record<string, Record<string, string>> = {}
  const providers = value.slice(0, 12).map((item, index) => {
    const input = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const name = cleanString(input.name, 120)
    const templateId = cleanString(input.templateId, 120) || cleanString(input.id, 120) || cleanString(input.type, 120)
    const credentialValues = cleanEnvRecord(input.credentialValues, 12000)
    const providerKey = name || templateId || `provider-${index + 1}`
    if (Object.keys(credentialValues).length > 0) providerCredentialValues[providerKey] = credentialValues
    return {
      id: cleanString(input.id, 120) || undefined,
      templateId: templateId || undefined,
      name: name || undefined,
      type: cleanString(input.type, 120) || undefined,
      role: cleanString(input.role, 80) as RuntimeProviderInput['role'],
      mode: cleanString(input.mode, 80) as RuntimeProviderInput['mode'],
      credentialKeys: Array.isArray(input.credentialKeys) ? input.credentialKeys.map((key) => cleanString(key, 120)).filter(Boolean) : undefined,
      env: cleanEnvRecord(input.env),
      config: cleanEnvRecord(input.config),
      sourceEnv: cleanEnvRecord(input.sourceEnv),
      endpoints: Array.isArray(input.endpoints) ? input.endpoints.slice(0, 20) as RuntimeProviderInput['endpoints'] : undefined,
      attach: input.attach === false ? false : undefined,
      useForInference: typeof input.useForInference === 'boolean' ? input.useForInference : undefined,
    } satisfies RuntimeProviderInput
  })

  return { providers, providerCredentialValues }
}

function normalizeResources(value: unknown): RuntimeResourceLimits {
  if (!value || typeof value !== 'object') return {}
  const input = value as Record<string, unknown>
  return {
    cpu: cleanString(input.cpu, 32) || undefined,
    memory: cleanString(input.memory, 32) || undefined,
    gpu: input.gpu === true,
  }
}

export function normalizeDeploymentInput(input: DeploymentValidationInput): NormalizedDeploymentInput {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const agentId = typeof input.agentId === 'string' ? input.agentId.trim() : ''
  const runtimeKind = typeof input.runtimeKind === 'string' ? input.runtimeKind : 'custom'
  const runtimeId = runtimeIdFromKind(input.runtimeId || runtimeKind)
  const gatewayId = cleanIdentifier(input.gatewayId, 'map')
  const runtimeCommand = typeof input.runtimeCommand === 'string' ? input.runtimeCommand.trim() : ''
  const runtimePackage = normalizeRuntimePackage(input.runtimePackage)
  const policyYaml = typeof input.policyYaml === 'string' ? input.policyYaml.trim() : ''
  const sandboxImage = cleanString(input.sandboxImage, 240)
  const executionMode = EXECUTION_MODES.includes(input.executionMode as ExecutionMode)
    ? input.executionMode as ExecutionMode
    : 'oneshot'
  const providerMode = PROVIDER_MODES.includes(input.providerMode as ProviderMode)
    ? input.providerMode as ProviderMode
    : 'providers-v2'
  const policyMode = POLICY_MODES.includes(input.policyMode as PolicyMode)
    ? input.policyMode as PolicyMode
    : (policyYaml ? 'custom' : 'generated')
  const advancedAcknowledgements = Array.isArray(input.advancedAcknowledgements)
    ? input.advancedAcknowledgements.map((item) => cleanString(item, 120)).filter(Boolean).slice(0, 20)
    : []
  const { providers, providerCredentialValues } = normalizeProviders(input.providers)
  const resources = normalizeResources(input.resources)
  const environment = cleanEnvRecord(input.environment)

  if (!agentId) throw new Error('Choose an agent to deploy.')
  if (!name) throw new Error('Deployment name is required.')
  if (!RUNTIME_KINDS.includes(runtimeKind as RuntimeKind)) {
    throw new Error('Unsupported runtime kind.')
  }
  if (!runtimeCommand) throw new Error('Runtime command is required.')
  if (policyMode !== 'generated' && !policyYaml) {
    throw new Error('Policy YAML is required for locked or custom policy mode.')
  }
  if (policyYaml && !policyYaml.includes('version:')) {
    throw new Error('Policy YAML must include a version field.')
  }

  return {
    name,
    agentId,
    runtimeKind: runtimeKind as RuntimeKind,
    runtimeId,
    gatewayId,
    runtimeCommand,
    runtimePackage,
    policyYaml,
    sandboxImage,
    executionMode,
    providerMode,
    policyMode,
    advancedAcknowledgements,
    providers,
    providerCredentialValues,
    resources,
    environment,
  }
}

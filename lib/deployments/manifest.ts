import { validateAgentConfig } from '../validation'
import type { AgentConfig, ConflictRule } from '../types'
import {
  DEFAULT_SANDBOX_WORKDIR,
  getProviderTemplate,
  getRuntimeTemplate,
  isProviderCompatibleWithRuntime,
  providerModeFromValue,
  providerRoleFromValue,
  runtimeIdFromKind,
} from './catalog'
import { mergeRuntimePackages, normalizeRuntimePackage } from '../runtime-assets'
import type {
  DeploymentPreflightReport,
  ExecutionMode,
  PolicyMode,
  PreflightCheck,
  ProviderMode,
  RuntimeEndpointConnection,
  RuntimeId,
  RuntimeManifestV2,
  RuntimePackage,
  RuntimeProviderInput,
  RuntimeProviderSelection,
  RuntimeResourceLimits,
} from './types'

const DEFAULT_RUNTIME_PACKAGE: RuntimePackage = {
  env: {},
  secretEnv: {},
  tools: [],
  scripts: [],
  files: [],
  ports: [],
  connections: [],
  securityNotes: [],
}

const KNOWN_EXECUTION_MODES = new Set(['oneshot', 'interactive', 'service'])
const HOST_PATTERN = /^https?:\/\/([^/:]+)(?::(\d+))?|^([^/:]+)(?::(\d+))?/

function cleanString(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanEnvKey(value: unknown): string {
  return cleanString(value, 120).replace(/[^A-Z0-9_]/gi, '_').slice(0, 100)
}

function cleanProviderName(value: unknown, fallback: string): string {
  const clean = cleanString(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || fallback
}

function sanitizeLabelValue(value: unknown): string {
  const clean = cleanString(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || 'unknown'
}

function cleanEnvRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [cleanEnvKey(key), cleanString(val, 2000)] as const)
      .filter(([key, val]) => key && val),
  )
}

function uniqueConnections(connections: RuntimeEndpointConnection[]): RuntimeEndpointConnection[] {
  const seen = new Set<string>()
  const output: RuntimeEndpointConnection[] = []
  for (const connection of connections) {
    const key = `${connection.direction}:${connection.target}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(connection)
  }
  return output
}

function normalizeConnection(value: unknown, fallbackName: string): RuntimeEndpointConnection | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const target = cleanString(input.target, 500)
  if (!target) return null
  return {
    name: cleanString(input.name, 120) || fallbackName,
    target,
    direction: String(input.direction) === 'inbound' ? 'inbound' : 'outbound',
    description: cleanString(input.description, 500) || undefined,
  }
}

function normalizePackage(value: unknown): RuntimePackage {
  return normalizeRuntimePackage(value)
}

export function normalizeProviderInputs(
  value: unknown,
  deploymentId: string,
  runtimeId: RuntimeId,
): { providers: RuntimeProviderSelection[]; credentialValues: Record<string, Record<string, string>> } {
  const runtime = getRuntimeTemplate(runtimeId)
  const rawInputs: RuntimeProviderInput[] = Array.isArray(value) && value.length > 0
    ? value as RuntimeProviderInput[]
    : runtime.defaultProviderIds.map((templateId) => ({ templateId }))

  const providers: RuntimeProviderSelection[] = []
  const credentialValues: Record<string, Record<string, string>> = {}

  rawInputs.slice(0, 12).forEach((input, index) => {
    const template = getProviderTemplate(input.templateId ?? input.id ?? input.type)
    const isInternalMapMcp = input.id === 'map-mcp' || input.templateId === 'map-mcp'
    const providerName = cleanProviderName(input.name, `map-${deploymentId}-${template.id}-${index + 1}`)
    const credentialKeys = Array.from(new Set([
      ...(isInternalMapMcp ? [] : template.credentialKeys),
      ...(Array.isArray(input.credentialKeys) ? input.credentialKeys.map(cleanEnvKey).filter(Boolean) : []),
    ]))
    const endpoints = uniqueConnections([
      ...(isInternalMapMcp ? [] : template.endpoints),
      ...(Array.isArray(input.endpoints)
        ? input.endpoints.map((item, itemIndex) => normalizeConnection(item, `${template.label}-${itemIndex + 1}`)).filter(Boolean) as RuntimeEndpointConnection[]
        : []),
    ])

    const sourceEnvInput = cleanEnvRecord(input.sourceEnv)
    const sourceEnv = Object.fromEntries(
      credentialKeys.map((key) => [key, sourceEnvInput[key] || key] as const),
    )

    providers.push({
      id: cleanString(input.id, 120) || template.id,
      name: providerName,
      type: cleanString(input.type, 120) || template.type,
      role: providerRoleFromValue(input.role, isInternalMapMcp ? 'mcp' : template.role),
      mode: providerModeFromValue(input.mode, template.mode),
      credentialKeys,
      env: { ...(isInternalMapMcp ? {} : template.env), ...cleanEnvRecord(input.env) },
      config: { ...(isInternalMapMcp ? {} : template.config), ...cleanEnvRecord(input.config) },
      sourceEnv,
      endpoints,
      attach: input.attach !== false,
      useForInference: input.useForInference ?? (isInternalMapMcp ? false : template.supportsInferenceLocal),
    })

    const values = cleanEnvRecord(input.credentialValues)
    if (Object.keys(values).length > 0) {
      credentialValues[providerName] = values
    }
  })

  return { providers, credentialValues }
}

export function normalizeRuntimeResources(value: unknown): RuntimeResourceLimits {
  if (!value || typeof value !== 'object') return {}
  const input = value as RuntimeResourceLimits
  return {
    cpu: cleanString(input.cpu, 32) || undefined,
    memory: cleanString(input.memory, 32) || undefined,
    gpu: input.gpu === true,
  }
}

function endpointFromTarget(target: string) {
  const match = target.match(HOST_PATTERN)
  const host = match?.[1] || match?.[3] || target
  const port = Number(match?.[2] || match?.[4] || (target.startsWith('http://') ? 80 : 443))
  const protocol = target.startsWith('http://') || target.startsWith('https://') ? 'rest' : 'tcp'
  return { host, port, protocol }
}

function yamlList(values: string[]): string {
  return values.length > 0 ? `[${values.join(', ')}]` : '[]'
}

export function buildPolicyYaml(params: {
  runtimeId: RuntimeId
  providers: RuntimeProviderSelection[]
  connections: RuntimeEndpointConnection[]
  customPolicyYaml?: string
}): string {
  const custom = cleanString(params.customPolicyYaml, 30000)
  if (custom) return custom

  const runtime = getRuntimeTemplate(params.runtimeId)
  const outbound = uniqueConnections([
    ...params.providers.flatMap((provider) => provider.endpoints),
    ...params.connections,
  ]).filter((connection) => connection.direction === 'outbound')

  const binaries = Array.from(new Set([
    ...runtime.requiredBinaries,
    '/usr/bin/curl',
    '/usr/local/bin/curl',
    '/usr/bin/git',
    '/usr/local/bin/git',
    '/usr/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
  ]))

  const lines = [
    'version: 1',
    'filesystem_policy:',
    '  read_only: [/usr, /lib, /etc]',
    '  read_write: [/sandbox, /tmp]',
    'landlock:',
    '  compatibility: best_effort',
    'process:',
    '  run_as_user: sandbox',
    '  run_as_group: sandbox',
  ]

  if (outbound.length === 0) {
    lines.push('network_policies: {}')
    return `${lines.join('\n')}\n`
  }

  lines.push('network_policies:')
  outbound.forEach((connection, index) => {
    const endpoint = endpointFromTarget(connection.target)
    const key = connection.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `endpoint_${index + 1}`
    lines.push(
      `  ${key}:`,
      `    name: ${connection.name}`,
      '    endpoints:',
      `      - host: ${endpoint.host}`,
      `        port: ${endpoint.port}`,
      `        protocol: ${endpoint.protocol}`,
      '        enforcement: enforce',
      '        access: full',
      '    binaries:',
      ...binaries.map((binary) => `      - path: ${binary}`),
    )
  })

  return `${lines.join('\n')}\n`
}

export function buildRuntimeManifest(params: {
  deploymentId: string
  sandboxName: string
  agent: AgentConfig & { groupId?: string | null; currentVersionId?: string | null }
  gatewayId?: unknown
  gateway?: { id?: unknown; endpoint?: unknown; mode?: unknown; label?: unknown }
  runtimeId?: unknown
  runtimeCommand?: unknown
  runtimePackage?: unknown
  providers?: unknown
  sandboxImage?: unknown
  executionMode?: unknown
  providerMode?: unknown
  resources?: unknown
  policyYaml?: unknown
  policyMode?: unknown
  environment?: unknown
}): { manifest: RuntimeManifestV2; credentialValues: Record<string, Record<string, string>> } {
  const runtimeId = runtimeIdFromKind(params.runtimeId)
  const runtime = getRuntimeTemplate(runtimeId)
  const gatewayId = cleanProviderName(params.gatewayId || params.gateway?.id || 'map', 'map')
  const packageInput = normalizePackage(mergeRuntimePackages(params.agent.runtimePackage, params.runtimePackage))
  const { providers, credentialValues } = normalizeProviderInputs(params.providers, params.deploymentId, runtimeId)
  const providerMode = providerModeFromValue(params.providerMode, runtime.providerMode)
  const policyMode = ['generated', 'locked', 'custom'].includes(String(params.policyMode))
    ? String(params.policyMode) as PolicyMode
    : (cleanString(params.policyYaml) ? 'custom' : 'generated')
  const executionMode = KNOWN_EXECUTION_MODES.has(String(params.executionMode))
    ? String(params.executionMode) as ExecutionMode
    : 'oneshot'
  const resources = normalizeRuntimeResources(params.resources)
  const env = cleanEnvRecord(params.environment)
  const runtimePackage: RuntimePackage = {
    ...DEFAULT_RUNTIME_PACKAGE,
    ...packageInput,
    env: {
      ...packageInput.env,
      ...env,
      ...Object.assign({}, ...providers.map((provider) => provider.env)),
      MAP_RUNTIME_NAME: params.sandboxName,
      MAP_RUNTIME_VERSION: '2',
    },
    connections: uniqueConnections([
      ...packageInput.connections,
      ...providers.flatMap((provider) => provider.endpoints),
    ]),
  }
  const policyYaml = buildPolicyYaml({
    runtimeId,
    providers,
    connections: runtimePackage.connections,
    customPolicyYaml: policyMode === 'generated' ? '' : params.policyYaml as string,
  })
  const labels = {
    'map.deployment': params.deploymentId,
    'map.agent': params.agent.id,
    'map.group': params.agent.groupId ? String(params.agent.groupId) : 'personal',
    'map.runtime': runtimeId,
    'map.promptVersion': params.agent.currentVersionId ? String(params.agent.currentVersionId) : 'current',
    'map.environment': sanitizeLabelValue(params.environment && typeof params.environment === 'object'
      ? (params.environment as Record<string, unknown>).MAP_ENVIRONMENT
      : 'development'),
  }
  const inferenceProvider = providers.find((provider) => provider.useForInference) ?? providers[0]
  const inferenceModel = inferenceProvider
    ? String(inferenceProvider.env.OPENAI_MODEL || inferenceProvider.env.ANTHROPIC_MODEL || inferenceProvider.env.GEMINI_MODEL || inferenceProvider.config.MODEL || '').trim()
    : ''
  const inferenceEndpoint = inferenceProvider
    ? String(inferenceProvider.env.OPENAI_BASE_URL || inferenceProvider.env.ANTHROPIC_BASE_URL || inferenceProvider.config.BASE_URL || '').trim()
    : ''

  return {
    manifest: {
      version: 2,
      gateway: {
        id: gatewayId,
        endpoint: cleanString(params.gateway?.endpoint, 500) || undefined,
        mode: ['local-docker', 'remote-docker', 'kubernetes', 'custom'].includes(String(params.gateway?.mode))
          ? String(params.gateway?.mode) as RuntimeManifestV2['gateway']['mode']
          : undefined,
        label: cleanString(params.gateway?.label, 120) || undefined,
      },
      prompt: {
        agentId: params.agent.id,
        agentVersionId: params.agent.currentVersionId ?? null,
        name: params.agent.name,
      },
      runtime: {
        id: runtimeId,
        command: cleanString(params.runtimeCommand, 4000) || runtime.defaultCommand,
        image: cleanString(params.sandboxImage, 240) || runtime.image,
        executionMode,
        workdir: DEFAULT_SANDBOX_WORKDIR,
      },
      providers,
      package: runtimePackage,
      policy: {
        yaml: policyYaml,
        mode: policyMode,
        staticRequiresRecreate: true,
      },
      privacy: {
        mode: providerMode === 'inference-local' ? 'inference-local' : 'direct',
        required: providerMode === 'inference-local',
        gatewayScoped: providerMode === 'inference-local',
        providerName: providerMode === 'inference-local' ? inferenceProvider?.name : undefined,
        model: providerMode === 'inference-local' ? inferenceModel || undefined : undefined,
        endpoint: providerMode === 'inference-local' ? inferenceEndpoint || 'https://inference.local' : undefined,
      },
      security: {
        providerMode,
        legacySecretEnvAllowed: process.env.OPENSHELL_ALLOW_LEGACY_SECRET_ENV === 'true',
        rawCliAllowed: process.env.OPENSHELL_ALLOW_RAW_CLI === 'true',
        notes: runtimePackage.securityNotes,
      },
      resources,
      labels,
    },
    credentialValues,
  }
}

function check(status: PreflightCheck['status'], id: string, label: string, message: string, detail?: string): PreflightCheck {
  return { id, label, status, message, detail }
}

function graphIssues(agent: AgentConfig): ConflictRule[] {
  try {
    return validateAgentConfig(agent)
  } catch {
    return []
  }
}

type CredentialSources = Record<string, { present?: boolean; usedBy?: string[] }>
type ProviderCredentialValues = Record<string, Record<string, string>>

function hasPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim()
  if (!normalized) return false
  return /(^|[^a-z0-9])(your-|YOUR_|CHANGE_ME|REPLACE_ME|api\.example\.com|example\.com)/i.test(normalized)
}

function providerDisplayName(provider: RuntimeProviderSelection): string {
  return provider.name || provider.id || provider.type
}

function providerCredentialValueBag(provider: RuntimeProviderSelection, values: ProviderCredentialValues = {}): Record<string, string> {
  for (const key of [provider.name, provider.id, provider.type].filter(Boolean)) {
    const match = values[String(key)]
    if (match && typeof match === 'object' && !Array.isArray(match)) return match
  }
  return {}
}

export function buildPreflightReport(
  agent: AgentConfig,
  manifest: RuntimeManifestV2,
  options: { credentialSources?: CredentialSources; providerCredentialValues?: ProviderCredentialValues } = {},
): DeploymentPreflightReport {
  const runtime = getRuntimeTemplate(manifest.runtime.id)
  const checks: PreflightCheck[] = []
  const conflicts = graphIssues(agent)
  const blockingGraphIssues = conflicts.filter((issue) => issue.type === 'error')
  const warningGraphIssues = conflicts.filter((issue) => issue.type !== 'error')

  checks.push(blockingGraphIssues.length > 0
    ? check('fail', 'prompt-structure', 'Prompt readiness', `${blockingGraphIssues.length} structural issue(s) must be fixed before deploy.`, blockingGraphIssues.map((issue) => issue.message).join('\n'))
    : check(warningGraphIssues.length > 0 ? 'warn' : 'pass', 'prompt-structure', 'Prompt readiness', warningGraphIssues.length > 0 ? `${warningGraphIssues.length} non-blocking graph warning(s).` : 'No blocking graph validation errors.'))

  checks.push(manifest.runtime.command.includes('{prompt}')
    ? check('pass', 'prompt-placeholder', 'Pinned prompt input', 'Runtime command references the pinned prompt file.')
    : check('fail', 'prompt-placeholder', 'Pinned prompt input', 'Runtime command must include {prompt}.'))

  checks.push(manifest.runtime.command.includes('{input}')
    ? check('pass', 'chat-placeholder', 'Chat input', 'Runtime command references the latest chat input file.')
    : check('fail', 'chat-placeholder', 'Chat input', 'Runtime command must include {input}.'))

  checks.push(manifest.runtime.image
    ? check('pass', 'sandbox-image', 'Sandbox image', `OpenShell will create from ${manifest.runtime.image}.`)
    : check('fail', 'sandbox-image', 'Sandbox image', 'Choose an OpenShell sandbox image.'))

  checks.push(manifest.gateway.id
    ? check('pass', 'gateway-selected', 'OpenShell gateway', `Sandbox will run on gateway ${manifest.gateway.id}.`)
    : check('fail', 'gateway-selected', 'OpenShell gateway', 'Choose an OpenShell gateway for this sandbox.'))

  const runtimeModelProviders = manifest.providers.filter((provider) => provider.role === 'llm' || provider.useForInference)
  const incompatibleProviders = runtimeModelProviders.filter((provider) => !isProviderCompatibleWithRuntime(provider.id, manifest.runtime.id))
  checks.push(incompatibleProviders.length === 0
    ? check('pass', 'runtime-provider-compatibility', 'Runtime/provider compatibility', 'Selected provider family is compatible with the CLI runtime.')
    : check('fail', 'runtime-provider-compatibility', 'Runtime/provider compatibility', `${runtime.label} cannot use: ${incompatibleProviders.map((provider) => provider.id).join(', ')}.`))

  if (manifest.privacy.required) {
    const inferenceProviders = manifest.providers.filter((provider) => provider.useForInference !== false)
    const unsupportedProviders = inferenceProviders.filter((provider) => !getProviderTemplate(provider.id).supportsInferenceLocal)
    if (!runtime.supportsInferenceLocal) {
      checks.push(check('fail', 'privacy-runtime-support', 'Privacy router', `${runtime.label} does not support inference.local routing in this setup.`))
    } else if (inferenceProviders.length === 0) {
      checks.push(check('fail', 'privacy-provider-selected', 'Privacy router', 'Choose a provider for inference.local routing.'))
    } else if (unsupportedProviders.length > 0) {
      checks.push(check('fail', 'privacy-provider-support', 'Privacy router', `${unsupportedProviders.map((provider) => provider.id).join(', ')} cannot be used with inference.local.`))
    } else {
      checks.push(check('pass', 'privacy-inference-local', 'Privacy router', `Gateway-scoped inference.local will route through ${manifest.privacy.providerName ?? inferenceProviders[0]?.name}.`))
    }
  } else {
    checks.push(check('warn', 'privacy-direct', 'Privacy router', 'Runtime will call the configured endpoint directly; OpenShell network policy controls that traffic.'))
  }

  if (manifest.runtime.id === 'gemini-cli') {
    const hasGeminiProvider = manifest.providers.some((provider) => provider.credentialKeys.includes('GEMINI_API_KEY') || provider.type === 'google-vertex-ai')
    checks.push(hasGeminiProvider
      ? check('pass', 'gemini-auth', 'Gemini CLI auth', 'Gemini CLI has Google AI Studio or Vertex AI provider metadata.')
      : check('fail', 'gemini-auth', 'Gemini CLI auth', 'Gemini CLI needs GEMINI_API_KEY or Vertex AI provider setup.'))
  }

  const providerCredentialWarnings = manifest.providers.flatMap((provider) => {
    if (provider.credentialKeys.length === 0) return []
    return provider.credentialKeys.filter((key) => !provider.sourceEnv[key])
      .map((key) => `${provider.name}:${key}`)
  })
  checks.push(providerCredentialWarnings.length === 0
    ? check('pass', 'provider-credentials', 'Provider credentials', 'Provider credential keys map to worker env names or one-time values.')
    : check('warn', 'provider-credentials', 'Provider credentials', 'Some provider credential keys have no source env mapping.', providerCredentialWarnings.join('\n')))

  const missingWorkerEnv = manifest.providers.flatMap((provider) => {
    if (provider.attach === false || manifest.security.providerMode === 'direct') return []
    const credentialValues = providerCredentialValueBag(provider, options.providerCredentialValues)
    return provider.credentialKeys.flatMap((key) => {
      const sourceKey = provider.sourceEnv[key] || key
      if (credentialValues[key] || credentialValues[sourceKey]) return []
      const status = options.credentialSources?.[sourceKey]
      if (status && status.present === false) return [`${providerDisplayName(provider)}:${key} from ${sourceKey}`]
      return []
    })
  })
  if (missingWorkerEnv.length > 0) {
    checks.push(check('fail', 'worker-credential-env', 'Worker credential env', 'One or more selected provider env vars are missing on deployment-worker.', missingWorkerEnv.join('\n')))
  } else if (Object.keys(options.credentialSources ?? {}).length > 0) {
    checks.push(check('pass', 'worker-credential-env', 'Worker credential env', 'Selected provider env vars are present on deployment-worker.'))
  }

  checks.push(manifest.security.providerMode === 'legacy-env'
    ? check(manifest.security.legacySecretEnvAllowed ? 'warn' : 'fail', 'provider-mode', 'Provider mode', manifest.security.legacySecretEnvAllowed ? 'Legacy env pass-through is enabled for local development.' : 'Legacy env pass-through is disabled; use Providers v2.')
    : check('pass', 'provider-mode', 'Provider mode', `Using ${manifest.security.providerMode}.`))

  checks.push(manifest.policy.yaml.includes('version:')
    ? check('pass', 'policy-version', 'Policy YAML', 'OpenShell policy includes a version field.')
    : check('fail', 'policy-version', 'Policy YAML', 'OpenShell policy YAML must include version.'))

  const hasNetwork = !manifest.policy.yaml.includes('network_policies: {}')
  const needsNetwork = manifest.providers.length > 0 || manifest.package.connections.length > 0
  checks.push(!needsNetwork || hasNetwork
    ? check('pass', 'traffic-policy', 'Traffic policy', needsNetwork ? 'Policy includes network rules for declared providers/connections.' : 'No outbound providers or connections declared.')
    : check('fail', 'traffic-policy', 'Traffic policy', 'Connections/providers are declared but policy appears network-locked. Use generated policy or add matching network rules.'))

  const placeholderValues = [
    ...Object.entries(manifest.package.env).map(([key, value]) => `env.${key}=${value}`),
    ...manifest.providers.flatMap((provider) => [
      ...Object.entries(provider.env).map(([key, value]) => `${providerDisplayName(provider)}.env.${key}=${value}`),
      ...Object.entries(provider.config).map(([key, value]) => `${providerDisplayName(provider)}.config.${key}=${value}`),
      ...provider.endpoints.map((endpoint) => `${providerDisplayName(provider)}.endpoint=${endpoint.target}`),
    ]),
  ].filter((entry) => hasPlaceholder(entry))
  checks.push(placeholderValues.length === 0
    ? check('pass', 'placeholder-values', 'Placeholder values', 'No obvious placeholder endpoint, model, or credential-source values remain.')
    : check('fail', 'placeholder-values', 'Placeholder values', 'Replace placeholder endpoint, model, or credential-source values before deployment.', placeholderValues.join('\n')))

  const unimplementedTools = manifest.package.tools.filter((tool) => tool.needsImplementation)
  checks.push(unimplementedTools.length === 0
    ? check('pass', 'runtime-tools-ready', 'Runtime tools', 'No packaged tools are marked as needing implementation.')
    : check('fail', 'runtime-tools-ready', 'Runtime tools', 'Some packaged graph/manual tools still need implementation before this sandbox can run reliably.', unimplementedTools.map((tool) => tool.name).join('\n')))

  checks.push(runtime.requiredBinaries.length > 0
    ? check('warn', 'runtime-binary', 'Runtime binary', `Worker will verify ${runtime.binary} with command -v during provisioning.`)
    : check('pass', 'runtime-binary', 'Runtime binary', 'Custom runtime has no preset binary requirement.'))

  const blockingIssues = checks.filter((item) => item.status === 'fail').length
  const warnings = checks.filter((item) => item.status === 'warn').length
  return {
    ok: blockingIssues === 0,
    blockingIssues,
    warnings,
    checks,
    manifest,
  }
}

export function redactProviderCredentialValues<T extends { providers?: RuntimeProviderInput[] }>(input: T): T {
  if (!Array.isArray(input.providers)) return input
  return {
    ...input,
    providers: input.providers.map(({ credentialValues: _omit, ...provider }) => provider),
  }
}

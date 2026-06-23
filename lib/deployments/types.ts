export const DEPLOYMENT_STATUSES = [
  'pending',
  'provisioning',
  'ready',
  'stopped',
  'error',
  'deleting',
] as const

export type DeploymentStatus = typeof DEPLOYMENT_STATUSES[number]

export const RUNTIME_KINDS = ['codex', 'claude-code', 'opencode', 'gemini-cli', 'custom'] as const

export type RuntimeKind = typeof RUNTIME_KINDS[number]

export const RUNTIME_IDS = RUNTIME_KINDS

export type RuntimeId = RuntimeKind

export const EXECUTION_MODES = ['oneshot', 'interactive', 'service'] as const

export type ExecutionMode = typeof EXECUTION_MODES[number]

export const PROVIDER_MODES = ['providers-v2', 'inference-local', 'legacy-env', 'direct'] as const

export type ProviderMode = typeof PROVIDER_MODES[number]

export const POLICY_MODES = ['generated', 'locked', 'custom'] as const

export type PolicyMode = typeof POLICY_MODES[number]

export const PROVIDER_ROLES = ['llm', 'tool', 'mcp', 'source-control', 'data', 'custom'] as const

export type ProviderRole = typeof PROVIDER_ROLES[number]

export type RuntimeTemplate = {
  id: RuntimeId
  label: string
  description: string
  image: string
  recommendedImages?: Array<{
    value: string
    label: string
    description: string
    default?: boolean
  }>
  defaultCommand: string
  binary: string
  providerMode: ProviderMode
  defaultProviderIds: string[]
  compatibleProviderIds?: string[]
  requiredBinaries: string[]
  requiredEnv: string[]
  supportsInferenceLocal: boolean
  supportsInteractive: boolean
  simpleSetup?: boolean
}

export type ProviderTemplate = {
  id: string
  label: string
  description: string
  type: string
  role: ProviderRole
  mode: ProviderMode
  credentialKeys: string[]
  env: Record<string, string>
  config: Record<string, string>
  endpoints: RuntimeEndpointConnection[]
  supportsInferenceLocal: boolean
  supportsRefresh: boolean
  profileRequired?: boolean
  compatibleRuntimeIds?: RuntimeId[]
  defaultModels?: string[]
  endpointEnvKey?: string
  modelEnvKey?: string
  apiKeyEnvKey?: string
  simpleSetup?: boolean
}

export type RuntimeGatewayProfile = {
  id: string
  label: string
  endpoint: string
  mode: 'local-docker' | 'remote-docker' | 'kubernetes' | 'custom'
  description: string
  authMode?: 'local' | 'mtls' | 'token' | 'custom'
  status?: 'unknown' | 'ready' | 'error'
  groupId?: string | null
  createdBy?: string | null
  lastVerifiedAt?: string | null
  lastError?: string | null
  defaultForEnvironment?: string
}

export type RuntimeResourceLimits = {
  cpu?: string
  memory?: string
  gpu?: boolean
}

export type RuntimeEndpointConnection = {
  name: string
  target: string
  direction: 'outbound' | 'inbound'
  description?: string
}

export type RuntimeProviderSelection = {
  id: string
  name: string
  type: string
  role: ProviderRole
  mode: ProviderMode
  credentialKeys: string[]
  env: Record<string, string>
  config: Record<string, string>
  sourceEnv: Record<string, string>
  endpoints: RuntimeEndpointConnection[]
  attach: boolean
  useForInference: boolean
}

export type RuntimeProviderInput = Partial<RuntimeProviderSelection> & {
  templateId?: string
  credentialValues?: Record<string, string>
}

export type RuntimeManifestV2 = {
  version: 2
  gateway: {
    id: string
    endpoint?: string
    mode?: RuntimeGatewayProfile['mode']
    label?: string
  }
  prompt: {
    agentId: string
    agentVersionId: string | null
    name: string
    snapshotHash?: string
  }
  runtime: {
    id: RuntimeId
    command: string
    image: string
    executionMode: ExecutionMode
    workdir: string
  }
  providers: RuntimeProviderSelection[]
  package: RuntimePackage
  policy: {
    yaml: string
    mode: PolicyMode
    staticRequiresRecreate: boolean
  }
  privacy: {
    mode: 'inference-local' | 'direct'
    required: boolean
    gatewayScoped: boolean
    providerName?: string
    model?: string
    endpoint?: string
  }
  security: {
    providerMode: ProviderMode
    legacySecretEnvAllowed: boolean
    rawCliAllowed: boolean
    notes: string[]
  }
  resources: RuntimeResourceLimits
  labels: Record<string, string>
}

export type DeploymentEventType =
  | 'created'
  | 'preflight'
  | 'provisioning'
  | 'ready'
  | 'stopped'
  | 'error'
  | 'deleted'
  | 'policy_updated'
  | 'provider_attached'
  | 'provider_detached'
  | 'reconciled'
  | 'chat'

export type DeploymentEvent = {
  id: string
  deploymentId: string
  eventType: DeploymentEventType
  message: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type DeploymentProvider = {
  id: string
  deploymentId: string
  providerName: string
  providerType: string
  role: ProviderRole
  credentialKeys: string[]
  attachStatus: 'pending' | 'attached' | 'detached' | 'error'
  configSnapshot: Record<string, unknown>
  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PreflightCheckStatus = 'pass' | 'warn' | 'fail'

export type PreflightCheck = {
  id: string
  label: string
  status: PreflightCheckStatus
  message: string
  detail?: string
}

export type DeploymentPreflightReport = {
  ok: boolean
  blockingIssues: number
  warnings: number
  checks: PreflightCheck[]
  manifest: RuntimeManifestV2
}

export type DeploymentMessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'thinking'

export type RuntimePreset = {
  kind: RuntimeKind
  label: string
  command: string
}

export const GEMINI_CHAT_RESPONSE_RULES = [
  'Runtime response rules:',
  '- Return only the final user-facing assistant message.',
  '- Do not describe plans, reasoning, file inspection, shell commands, tool discovery, or sandbox environment checks.',
  '- If a requested tool or data source is unavailable, say so briefly and ask for the next user-facing detail.',
].join('\\n')

export type RuntimeTool = {
  name: string
  command: string
  description?: string
  sourceType?: 'preset' | 'graph' | 'manual'
  sourceNodeId?: string
  sourcePath?: string
  needsImplementation?: boolean
}

export type RuntimeScript = {
  name: string
  path: string
  content: string
  runOnStart?: boolean
  sourceType?: 'preset' | 'graph' | 'manual'
  sourceTool?: string
}

export type RuntimeFile = {
  path: string
  content: string
  sourceType?: 'preset' | 'graph' | 'manual'
}

export type RuntimePort = {
  name: string
  port: number
  protocol: 'tcp' | 'udp' | 'http' | 'https'
  exposure: 'blocked' | 'sandbox' | 'forwarded'
  description?: string
}

export type RuntimeConnection = {
  name: string
  target: string
  direction: 'outbound' | 'inbound'
  description?: string
}

export type RuntimePackage = {
  env: Record<string, string>
  secretEnv: Record<string, string>
  tools: RuntimeTool[]
  scripts: RuntimeScript[]
  files: RuntimeFile[]
  ports: RuntimePort[]
  connections: RuntimeConnection[]
  securityNotes: string[]
}

export const RUNTIME_PRESETS: RuntimePreset[] = [
  {
    kind: 'codex',
    label: 'Codex CLI',
    command: 'codex exec "$(printf \'%s\\n\\nUser input:\\n%s\' "$(cat {prompt})" "$(cat {input})")"',
  },
  {
    kind: 'claude-code',
    label: 'Claude Code',
    command: 'claude -p "$(cat {input})" --append-system-prompt "$(cat {prompt})"',
  },
  {
    kind: 'opencode',
    label: 'OpenCode',
    command: 'opencode run --prompt-file {prompt} "$(cat {input})"',
  },
  {
    kind: 'gemini-cli',
    label: 'Gemini CLI',
    command: `gemini -p "$(printf '%s\\n\\n${GEMINI_CHAT_RESPONSE_RULES}\\n\\nUser input:\\n%s' "$(cat {prompt})" "$(cat {input})")"`,
  },
  {
    kind: 'custom',
    label: 'Custom command',
    command: 'cat {prompt} {input}',
  },
]

export type DeploymentSummary = {
  id: string
  name: string
  agentId: string
  agentName?: string
  status: DeploymentStatus
  openshellSandboxName: string
  runtimeKind: RuntimeKind
  runtimeCommand: string
  manifestVersion: number
  runtimeId: RuntimeId
  sandboxImage: string
  executionMode: ExecutionMode
  providerMode: ProviderMode
  gatewayId: string
  preflightReport: DeploymentPreflightReport | Record<string, unknown>
  policyRevision: number
  observedPhase: string | null
  runtimeManifest: RuntimeManifestV2 | Record<string, unknown>
  runtimePackage: RuntimePackage
  providers?: DeploymentProvider[]
  events?: DeploymentEvent[]
  createdBy: string
  groupId: string | null
  lastError: string | null
  lastLog: string | null
  deployedAt: string | null
  stoppedAt: string | null
  createdAt: string
  updatedAt: string
  messageCount?: number
}

export type DeploymentDetail = DeploymentSummary & {
  policyYaml: string
  pinnedPrompt: string
  pinnedSnapshot: unknown
  messages: Array<{
    id: string
    role: DeploymentMessageRole
    content: string
    status: 'pending' | 'success' | 'error'
    metadata: Record<string, unknown>
    createdAt: string
  }>
}

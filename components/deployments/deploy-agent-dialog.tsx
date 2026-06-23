'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  FileCode2,
  FileText,
  Globe2,
  Info,
  KeyRound,
  Loader2,
  Network,
  PackageCheck,
  Plug,
  Rocket,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  RUNTIME_PRESETS,
  type DeploymentPreflightReport,
  type DeploymentSummary,
  type ExecutionMode,
  type PolicyMode,
  type ProviderMode,
  type RuntimeGatewayProfile,
  type RuntimeKind,
  type RuntimePackage,
  type RuntimeProviderInput,
} from '@/lib/deployments/types'
import type { AgentConfig } from '@/lib/types'
import {
  deriveRuntimeAssetRequirements,
  normalizeRuntimePackage,
  runtimeToolCommand,
  runtimeToolPath,
  runtimeToolStub,
} from '@/lib/runtime-assets'

const DEFAULT_POLICY = `version: 1
filesystem_policy:
  read_only: [/usr, /lib, /etc]
  read_write: [/sandbox, /tmp]
landlock:
  compatibility: best_effort
process:
  run_as_user: sandbox
  run_as_group: sandbox
network_policies: {}
`

const NETWORKED_POLICY = `version: 1
filesystem_policy:
  read_only: [/usr, /lib, /etc]
  read_write: [/sandbox, /tmp]
landlock:
  compatibility: best_effort
process:
  run_as_user: sandbox
  run_as_group: sandbox
network_policies:
  llm_and_map_services:
    name: llm-and-map-services
    endpoints:
      - host: api.openai.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
      - host: api.anthropic.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
      - host: generativelanguage.googleapis.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
      - host: integrate.api.nvidia.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
      - host: mcp-server
        port: 3100
        protocol: rest
        enforcement: enforce
        access: full
    binaries:
      - path: /usr/bin/curl
      - path: /usr/local/bin/curl
      - path: /usr/bin/node
      - path: /usr/local/bin/node
      - path: /usr/bin/python3
      - path: /usr/local/bin/python3
      - path: /usr/bin/codex
      - path: /usr/local/bin/codex
      - path: /usr/bin/claude
      - path: /usr/local/bin/claude
      - path: /usr/bin/opencode
      - path: /usr/local/bin/opencode
      - path: /usr/bin/gemini
      - path: /usr/local/bin/gemini
`

const LOCKED_POLICY = `version: 1
filesystem_policy:
  read_only: [/usr, /lib, /etc]
  read_write: [/sandbox]
landlock:
  compatibility: enforce
process:
  run_as_user: sandbox
  run_as_group: sandbox
network_policies: {}
`

type AgentOption = {
  id: string
  name: string
  description?: string | null
}

type AgentDetail = AgentOption & {
  nodes?: AgentConfig['nodes']
  originalPrompt?: string | null
  editedPrompt?: string | null
  runtimePackage?: RuntimePackage
}

type DeployAgentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string | null
  agentName?: string | null
  runtimeEnabled?: boolean
  onCreated?: (deployment: DeploymentSummary) => void
}

type WizardStep = 'runtime' | 'gateway' | 'policy' | 'privacy' | 'files' | 'review'
type SetupMode = 'simple' | 'advanced'
type ApiKeySourceMode = 'worker-env' | 'paste'

type ToolDraft = {
  name: string
  command: string
  description?: string
  sourceType?: 'preset' | 'graph' | 'manual'
  sourceNodeId?: string
  sourcePath?: string
  needsImplementation?: boolean
}

type ConnectionDraft = {
  name: string
  target: string
  direction: 'outbound' | 'inbound'
  description?: string
}

type ScriptDraft = {
  name: string
  path: string
  runOnStart: boolean
  content: string
  sourceType?: 'preset' | 'graph' | 'manual'
  sourceTool?: string
}

type FileDraft = {
  path: string
  content: string
  sourceType?: 'preset' | 'graph' | 'manual'
}

type PortDraft = {
  name: string
  port: number
  protocol: 'tcp' | 'udp' | 'http' | 'https'
  exposure: 'blocked' | 'sandbox' | 'forwarded'
  description?: string
}

const CODE_TEXTAREA_CLASS = 'font-mono text-xs leading-5 whitespace-pre overflow-x-auto'

const STEPS: Array<{ id: WizardStep; label: string; description: string }> = [
  { id: 'runtime', label: 'Prompt & Runtime', description: 'Prompt, CLI, model' },
  { id: 'gateway', label: 'Gateway', description: 'Control plane' },
  { id: 'policy', label: 'Access Policy', description: 'Filesystem and traffic' },
  { id: 'files', label: 'Tools', description: 'Env, graph, package' },
  { id: 'review', label: 'Review', description: 'Preflight and create' },
]

const LLM_PRESETS = {
  openai: {
    label: 'OpenAI',
    env: 'LLM_PROVIDER=openai-compatible\nOPENAI_BASE_URL=https://api.openai.com/v1\nOPENAI_MODEL=gpt-5.4-mini',
    secrets: '{\n  "OPENAI_API_KEY": "OPENAI_API_KEY"\n}',
    connection: { name: 'OpenAI API', target: 'https://api.openai.com', direction: 'outbound' as const, description: 'LLM API endpoint' },
  },
  anthropic: {
    label: 'Anthropic',
    env: 'LLM_PROVIDER=anthropic\nANTHROPIC_BASE_URL=https://api.anthropic.com\nANTHROPIC_MODEL=your-anthropic-model',
    secrets: '{\n  "ANTHROPIC_API_KEY": "ANTHROPIC_API_KEY"\n}',
    connection: { name: 'Anthropic API', target: 'https://api.anthropic.com', direction: 'outbound' as const, description: 'LLM API endpoint' },
  },
  litellm: {
    label: 'LiteLLM / OpenAI-compatible',
    env: 'LLM_PROVIDER=openai-compatible\nOPENAI_BASE_URL=http://litellm:4000/v1\nOPENAI_MODEL=your-litellm-model',
    secrets: '{\n  "OPENAI_API_KEY": "LITELLM_API_KEY"\n}',
    connection: { name: 'LiteLLM gateway', target: 'http://litellm:4000/v1', direction: 'outbound' as const, description: 'OpenAI-compatible gateway' },
  },
  azure: {
    label: 'Azure OpenAI',
    env: 'LLM_PROVIDER=azure-openai\nAZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com\nAZURE_OPENAI_API_VERSION=your-api-version\nAZURE_OPENAI_DEPLOYMENT=your-deployment\nOPENAI_API_TYPE=azure',
    secrets: '{\n  "AZURE_OPENAI_API_KEY": "AZURE_OPENAI_API_KEY"\n}',
    connection: { name: 'Azure OpenAI', target: 'https://your-resource.openai.azure.com', direction: 'outbound' as const, description: 'Azure OpenAI endpoint' },
  },
  foundry: {
    label: 'Azure AI Foundry',
    env: 'LLM_PROVIDER=openai-compatible\nOPENAI_BASE_URL=https://your-foundry-openai-compatible-endpoint\nOPENAI_MODEL=your-foundry-model',
    secrets: '{\n  "OPENAI_API_KEY": "AZURE_AI_API_KEY"\n}',
    connection: { name: 'Azure AI Foundry', target: 'https://your-foundry-openai-compatible-endpoint', direction: 'outbound' as const, description: 'OpenAI-compatible Foundry endpoint' },
  },
  google: {
    label: 'Google AI Studio',
    env: 'LLM_PROVIDER=google-ai-studio\nGEMINI_MODEL=gemini-3-flash-preview',
    secrets: '{\n  "GEMINI_API_KEY": "GEMINI_API_KEY"\n}',
    connection: { name: 'Gemini API', target: 'https://generativelanguage.googleapis.com', direction: 'outbound' as const, description: 'Google Gemini API endpoint' },
  },
  vertex: {
    label: 'Google Vertex AI',
    env: 'LLM_PROVIDER=google-vertex-ai\nGOOGLE_GENAI_USE_VERTEXAI=true\nGOOGLE_CLOUD_PROJECT=your-gcp-project\nGOOGLE_CLOUD_LOCATION=us-central1\nGEMINI_MODEL=gemini-3-flash-preview',
    secrets: '{\n  "GOOGLE_SERVICE_ACCOUNT_KEY": "GOOGLE_SERVICE_ACCOUNT_KEY"\n}',
    connection: { name: 'Vertex AI', target: 'https://aiplatform.googleapis.com', direction: 'outbound' as const, description: 'Google Vertex AI endpoint' },
  },
  nvidia: {
    label: 'NVIDIA API Catalog',
    env: 'LLM_PROVIDER=nvidia\nOPENAI_BASE_URL=https://inference.local/v1\nOPENAI_MODEL=nvidia/nemotron-3-nano-30b-a3b',
    secrets: '{\n  "NVIDIA_API_KEY": "NVIDIA_API_KEY"\n}',
    connection: { name: 'NVIDIA API', target: 'https://integrate.api.nvidia.com', direction: 'outbound' as const, description: 'NVIDIA inference endpoint' },
  },
  custom: {
    label: 'Custom endpoint',
    env: 'LLM_PROVIDER=custom\nOPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1\nOPENAI_MODEL=your-model',
    secrets: '{\n  "OPENAI_API_KEY": "YOUR_WORKER_SECRET_ENV"\n}',
    connection: { name: 'Custom LLM endpoint', target: 'https://your-openai-compatible-endpoint/v1', direction: 'outbound' as const, description: 'Custom LLM API endpoint' },
  },
} as const

type LlmPresetKey = keyof typeof LLM_PRESETS

const LLM_PRESET_BY_PROVIDER_TEMPLATE: Record<string, LlmPresetKey> = {
  'openai-compatible': 'openai',
  anthropic: 'anthropic',
  'azure-openai': 'azure',
  'azure-ai-foundry': 'foundry',
  'google-ai-studio': 'google',
  'google-vertex-ai': 'vertex',
  nvidia: 'nvidia',
  'custom-api': 'custom',
  'local-endpoint': 'custom',
}

const PROVIDER_TEMPLATE_BY_LLM_PRESET: Record<LlmPresetKey, string> = {
  openai: 'openai-compatible',
  anthropic: 'anthropic',
  litellm: 'openai-compatible',
  azure: 'azure-openai',
  foundry: 'azure-ai-foundry',
  google: 'google-ai-studio',
  vertex: 'google-vertex-ai',
  nvidia: 'nvidia',
  custom: 'custom-api',
}

const PROVIDER_TEMPLATE_LABELS = [
  ['openai-compatible', 'OpenAI-compatible'],
  ['anthropic', 'Anthropic'],
  ['azure-openai', 'Azure OpenAI'],
  ['azure-ai-foundry', 'Azure AI Foundry'],
  ['google-ai-studio', 'Google AI Studio'],
  ['google-vertex-ai', 'Google Vertex AI'],
  ['nvidia', 'NVIDIA API Catalog'],
  ['local-endpoint', 'Local endpoint'],
  ['custom-api', 'Custom API'],
] as const

const COMPATIBLE_LLM_PRESETS: Record<RuntimeKind, LlmPresetKey[]> = {
  codex: ['openai', 'litellm', 'azure', 'foundry', 'custom'],
  'claude-code': ['anthropic'],
  opencode: ['openai', 'litellm', 'azure', 'foundry', 'anthropic', 'custom'],
  'gemini-cli': ['google', 'vertex'],
  custom: ['openai', 'anthropic', 'litellm', 'azure', 'foundry', 'google', 'vertex', 'nvidia', 'custom'],
}

const DEFAULT_LLM_FOR_RUNTIME: Record<RuntimeKind, LlmPresetKey> = {
  codex: 'openai',
  'claude-code': 'anthropic',
  opencode: 'openai',
  'gemini-cli': 'google',
  custom: 'custom',
}

const MODEL_OPTIONS: Record<LlmPresetKey, string[]> = {
  openai: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.4-codex', 'custom-model'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-5', 'custom-model'],
  litellm: ['your-litellm-model', 'custom-model'],
  azure: ['your-deployment', 'custom-model'],
  foundry: ['your-foundry-model', 'custom-model'],
  google: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'custom-model'],
  vertex: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'custom-model'],
  nvidia: ['nvidia/nemotron-3-nano-30b-a3b', 'custom-model'],
  custom: ['your-model', 'custom-model'],
}

const IMAGE_OPTIONS: Record<RuntimeKind, Array<{ value: string; label: string; description: string }>> = {
  codex: [
    { value: 'base', label: 'base', description: 'Default OpenShell image. Use only if Codex CLI is installed there.' },
    { value: 'custom', label: 'Custom image', description: 'Pinned image that includes Codex CLI and your tools.' },
  ],
  'claude-code': [
    { value: 'base', label: 'base', description: 'Default OpenShell image. Use only if Claude Code is installed there.' },
    { value: 'custom', label: 'Custom image', description: 'Pinned image that includes Claude Code and your tools.' },
  ],
  opencode: [
    { value: 'base', label: 'base', description: 'Default OpenShell image. Use only if OpenCode is installed there.' },
    { value: 'custom', label: 'Custom image', description: 'Pinned image that includes OpenCode and your tools.' },
  ],
  'gemini-cli': [
    { value: 'gemini', label: 'gemini', description: 'OpenShell community image with Gemini CLI.' },
    { value: 'custom', label: 'Custom image', description: 'Pinned image with a team-approved Gemini CLI version.' },
  ],
  custom: [
    { value: 'base', label: 'base', description: 'Default OpenShell image.' },
    { value: 'custom', label: 'Custom image', description: 'Any image available to your OpenShell gateway.' },
  ],
}

const DEFAULT_TOOLS: ToolDraft[] = [
  {
    name: 'MAP MCP',
    command: 'curl -H "Authorization: Bearer $MCP_AUTH_TOKEN" $MCP_INTERNAL_URL',
    description: 'Internal MAP prompt and deployment tools',
    sourceType: 'preset',
    sourcePath: 'built-in',
  },
]

const DEFAULT_CONNECTIONS: ConnectionDraft[] = [
  {
    name: 'MAP MCP',
    target: 'http://mcp-server:3100/mcp',
    direction: 'outbound',
    description: 'Prompt hub and deployment tools',
  },
]

const DEFAULT_FILES: FileDraft[] = [
  { path: 'README.runtime.md', content: 'Runtime package for this MAP agent.', sourceType: 'preset' },
]

const DEFAULT_SCRIPTS: ScriptDraft[] = [
  { name: 'bootstrap', path: 'scripts/bootstrap.sh', runOnStart: false, content: 'echo runtime ready', sourceType: 'preset' },
]

const DEFAULT_PORTS: PortDraft[] = [
  {
    name: 'runtime-api',
    port: 8787,
    protocol: 'http',
    exposure: 'blocked',
    description: 'Documented only until forwarded in policy.',
  },
]

function parseEnvLines(value: string) {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        return index === -1 ? [line, ''] : [line.slice(0, index).trim(), line.slice(index + 1).trim()]
      })
      .filter(([key]) => key),
  )
}

function parseSecretEnvMap(value: string) {
  try {
    const parsed = JSON.parse(value || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Secret environment must be a JSON object')
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([runtimeKey, sourceKey]) => [runtimeKey.trim(), String(sourceKey).trim()] as const)
        .filter(([runtimeKey, sourceKey]) => runtimeKey && sourceKey),
    )
  } catch (err) {
    throw new Error(`Secret environment: ${err instanceof Error ? err.message : 'invalid JSON'}`)
  }
}

function tryParseSecretEnvMap(value: string) {
  try {
    return parseSecretEnvMap(value)
  } catch {
    return {}
  }
}

function envToText(env: Record<string, string>) {
  return Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n')
}

function setEnvValue(text: string, key: string, value: string) {
  return envToText({ ...parseEnvLines(text), [key]: value })
}

function modelEnvKeyForPreset(preset: LlmPresetKey) {
  if (preset === 'anthropic') return 'ANTHROPIC_MODEL'
  if (preset === 'azure') return 'AZURE_OPENAI_DEPLOYMENT'
  if (preset === 'google' || preset === 'vertex') return 'GEMINI_MODEL'
  return 'OPENAI_MODEL'
}

function endpointEnvKeyForPreset(preset: LlmPresetKey) {
  if (preset === 'anthropic') return 'ANTHROPIC_BASE_URL'
  if (preset === 'azure') return 'AZURE_OPENAI_ENDPOINT'
  if (preset === 'openai' || preset === 'litellm' || preset === 'foundry' || preset === 'nvidia' || preset === 'custom') return 'OPENAI_BASE_URL'
  return null
}

function firstSecretSource(value: string) {
  const parsed = tryParseSecretEnvMap(value)
  return Object.values(parsed)[0] ?? ''
}

function rewriteSecretSource(value: string, sourceEnvName: string) {
  const parsed = tryParseSecretEnvMap(value)
  const runtimeKey = Object.keys(parsed)[0] ?? 'API_KEY'
  return JSON.stringify({ [runtimeKey]: sourceEnvName }, null, 2)
}

function normalizeTarget(value: string) {
  return value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
}

function hasConnection(connections: ConnectionDraft[], target: string) {
  const normalized = normalizeTarget(target)
  return connections.some((connection) => normalizeTarget(connection.target).includes(normalized) || normalized.includes(normalizeTarget(connection.target)))
}

function appendUniqueConnection(connections: ConnectionDraft[], next: ConnectionDraft[]) {
  const existing = new Set(connections.map((connection) => `${connection.name}:${connection.target}`.toLowerCase()))
  return [
    ...connections,
    ...next.filter((connection) => !existing.has(`${connection.name}:${connection.target}`.toLowerCase())),
  ]
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-md border border-primary/30 bg-primary/10 p-1.5 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

function PillButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onClick}>
      {children}
    </Button>
  )
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-border/50 bg-muted/20 p-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="min-w-0 overflow-hidden text-sm">{value}</div>
    </div>
  )
}

function InfoHint({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
          <Info className="h-3.5 w-3.5" />
          <span className="sr-only">More information</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 leading-relaxed">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function LabelWithInfo({ children, info, htmlFor }: { children: ReactNode; info: string; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
      {children}
      <InfoHint label={info} />
    </Label>
  )
}

export function DeployAgentDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
  runtimeEnabled = true,
  onCreated,
}: DeployAgentDialogProps) {
  const [step, setStep] = useState<WizardStep>('runtime')
  const [name, setName] = useState('')
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<AgentDetail | null>(null)
  const [agentDetailLoading, setAgentDetailLoading] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState(agentId ?? '')
  const [runtimeKind, setRuntimeKind] = useState<RuntimeKind>('codex')
  const [runtimeCommand, setRuntimeCommand] = useState(RUNTIME_PRESETS.find(p => p.kind === 'codex')!.command)
  const [setupMode, setSetupMode] = useState<SetupMode>('simple')
  const [gatewayId, setGatewayId] = useState('map')
  const [gateways, setGateways] = useState<RuntimeGatewayProfile[]>([])
  const [newGatewayName, setNewGatewayName] = useState('')
  const [newGatewayEndpoint, setNewGatewayEndpoint] = useState('')
  const [newGatewayMode, setNewGatewayMode] = useState<RuntimeGatewayProfile['mode']>('custom')
  const [creatingGateway, setCreatingGateway] = useState(false)
  const [sandboxImage, setSandboxImage] = useState('base')
  const [imageChoice, setImageChoice] = useState('base')
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('oneshot')
  const [providerMode, setProviderMode] = useState<ProviderMode>('providers-v2')
  const [providerTemplateId, setProviderTemplateId] = useState('openai-compatible')
  const [providerName, setProviderName] = useState('map-openai-compatible')
  const [privacyRouteEnabled, setPrivacyRouteEnabled] = useState(false)
  const [privacyRouteAcknowledged, setPrivacyRouteAcknowledged] = useState(false)
  const [cpuLimit, setCpuLimit] = useState('')
  const [memoryLimit, setMemoryLimit] = useState('')
  const [gpuEnabled, setGpuEnabled] = useState(false)
  const [policyYaml, setPolicyYaml] = useState('')
  const [policyMode, setPolicyMode] = useState<PolicyMode>('generated')
  const [securityPreset, setSecurityPreset] = useState('generated')
  const [envText, setEnvText] = useState('MCP_INTERNAL_URL=http://mcp-server:3100/mcp\nMAP_RUNTIME_NAME=agent-runtime')
  const [llmPreset, setLlmPreset] = useState<LlmPresetKey>('openai')
  const [llmEnvText, setLlmEnvText] = useState<string>(LLM_PRESETS.openai.env)
  const [secretEnvText, setSecretEnvText] = useState<string>(LLM_PRESETS.openai.secrets)
  const [apiKeySourceMode, setApiKeySourceMode] = useState<ApiKeySourceMode>('worker-env')
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [tools, setTools] = useState<ToolDraft[]>(DEFAULT_TOOLS)
  const [scripts, setScripts] = useState<ScriptDraft[]>(DEFAULT_SCRIPTS)
  const [files, setFiles] = useState<FileDraft[]>(DEFAULT_FILES)
  const [ports, setPorts] = useState<PortDraft[]>(DEFAULT_PORTS)
  const [connections, setConnections] = useState<ConnectionDraft[]>(DEFAULT_CONNECTIONS)
  const [securityNotesText, setSecurityNotesText] = useState('User-supplied OpenShell policy is the authority.\nRuntime files are shipped under /sandbox/map.\nAPI keys should use LLM secret pass-through, not plain env.')
  const [advancedOpen, setAdvancedOpen] = useState<'policy' | 'tools' | 'scripts' | 'files' | 'ports' | 'connections' | 'manifest' | null>(null)
  const [runtimeCatalog, setRuntimeCatalog] = useState<Record<string, any> | null>(null)
  const [catalogDefaultsApplied, setCatalogDefaultsApplied] = useState(false)
  const [preflightReport, setPreflightReport] = useState<DeploymentPreflightReport | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const stepIndex = STEPS.findIndex((item) => item.id === step)
  const selectedAgent = useMemo(
    () => selectedAgentDetail ?? agents.find((agent) => agent.id === selectedAgentId) ?? (agentId && agentName && selectedAgentId === agentId ? { id: agentId, name: agentName } : null),
    [agentId, agentName, agents, selectedAgentDetail, selectedAgentId],
  )
  const selectedGateway = useMemo(
    () => gateways.find((gateway) => gateway.id === gatewayId) ?? { id: 'map', label: 'Local MAP gateway', endpoint: 'http://openshell-gateway:8080', mode: 'local-docker' as const, description: 'Default local OpenShell gateway' },
    [gatewayId, gateways],
  )
  const graphAssetRequirements = useMemo(
    () => selectedAgentDetail
      ? deriveRuntimeAssetRequirements({
        id: selectedAgentDetail.id,
        name: selectedAgentDetail.name,
        description: selectedAgentDetail.description ?? undefined,
        nodes: selectedAgentDetail.nodes ?? [],
        connections: [],
        version: '1',
        createdAt: '',
        updatedAt: '',
        runtimePackage: selectedAgentDetail.runtimePackage,
      })
      : [],
    [selectedAgentDetail],
  )
  const inferredGraphTools = useMemo<ToolDraft[]>(() => graphAssetRequirements
    .filter((item) => item.kind === 'tool')
    .map((item) => ({
      name: item.name,
      command: item.command || runtimeToolCommand(item.name),
      description: item.description,
      sourceType: 'graph',
      sourceNodeId: item.sourceNodeId,
      sourcePath: item.sourcePath || runtimeToolPath(item.name),
      needsImplementation: item.status !== 'attached',
    })), [graphAssetRequirements])
  const catalogRuntime = useMemo(() => {
    const runtimes = Array.isArray(runtimeCatalog?.runtimes) ? runtimeCatalog.runtimes : []
    return runtimes.find((runtime: any) => runtime.id === runtimeKind)
  }, [runtimeCatalog, runtimeKind])
  const catalogProvider = useMemo(() => {
    const providers = Array.isArray(runtimeCatalog?.providers) ? runtimeCatalog.providers : []
    return providers.find((provider: any) => provider.id === providerTemplateId)
  }, [providerTemplateId, runtimeCatalog])
  const setupChecks = Array.isArray(runtimeCatalog?.setup?.checks) ? runtimeCatalog.setup.checks : []
  const credentialSources: Record<string, { present?: boolean; usedBy?: string[] }> =
    runtimeCatalog?.credentialSources && typeof runtimeCatalog.credentialSources === 'object'
      ? runtimeCatalog.credentialSources
      : {}
  const compatibleLlmPresets = useMemo(() => COMPATIBLE_LLM_PRESETS[runtimeKind] ?? COMPATIBLE_LLM_PRESETS.custom, [runtimeKind])
  const modelEnvKey = modelEnvKeyForPreset(llmPreset)
  const endpointEnvKey = endpointEnvKeyForPreset(llmPreset)
  const catalogModelOptions = Array.isArray(catalogProvider?.defaultModels) && catalogProvider.defaultModels.length > 0
    ? catalogProvider.defaultModels as string[]
    : MODEL_OPTIONS[llmPreset]
  const selectedModel = parseEnvLines(llmEnvText)[modelEnvKey] ?? catalogModelOptions[0]
  const selectedEndpoint = endpointEnvKey
    ? parseEnvLines(llmEnvText)[endpointEnvKey] ?? ''
    : LLM_PRESETS[llmPreset].connection.target
  const providerConnection = useMemo<ConnectionDraft>(() => ({
    ...LLM_PRESETS[llmPreset].connection,
    target: selectedEndpoint || LLM_PRESETS[llmPreset].connection.target,
  }), [llmPreset, selectedEndpoint])
  const apiKeyEnvName = firstSecretSource(secretEnvText)
  const apiKeyRuntimeKey = Object.keys(tryParseSecretEnvMap(secretEnvText))[0]
    ?? catalogProvider?.apiKeyEnvKey
    ?? catalogProvider?.credentialKeys?.[0]
    ?? 'OPENAI_API_KEY'
  const credentialSourceOptions = Array.from(new Set([
    apiKeyEnvName,
    catalogProvider?.apiKeyEnvKey,
    ...(Array.isArray(catalogProvider?.credentialKeys) ? catalogProvider.credentialKeys : []),
    ...Object.keys(credentialSources),
  ].filter(Boolean) as string[]))
  const apiKeySourceStatus = apiKeyEnvName ? credentialSources[apiKeyEnvName] : undefined
  const pastedApiKey = apiKeyValue.trim()
  const hasPastedApiKey = apiKeySourceMode === 'paste' && pastedApiKey.length > 0
  const selectedImageOption = IMAGE_OPTIONS[runtimeKind].find((option) => option.value === imageChoice)
  const runtimeSupportsInferenceLocal = catalogRuntime?.supportsInferenceLocal ?? ['claude-code', 'opencode', 'custom'].includes(runtimeKind)
  const providerSupportsInferenceLocal = catalogProvider?.supportsInferenceLocal ?? ['anthropic', 'google-vertex-ai', 'nvidia', 'local-endpoint'].includes(providerTemplateId)
  const privacyRouteCompatible = runtimeSupportsInferenceLocal && providerSupportsInferenceLocal
  const gatewayCheck = setupChecks.find((check: any) => check.id === 'gateway')
  const providersV2Check = setupChecks.find((check: any) => check.id === 'providers-v2')
  const inferenceRoute = runtimeCatalog?.setup?.inferenceRoute ?? null

  useEffect(() => {
    if (open) {
      setStep('runtime')
      setName(agentName ? `${agentName} sandbox` : 'Agent sandbox')
      setSelectedAgentId(agentId ?? '')
      setPreflightReport(null)
      setCatalogDefaultsApplied(false)
      setApiKeySourceMode('worker-env')
      setApiKeyValue('')
    }
  }, [agentId, agentName, open])

  useEffect(() => {
    if (!open) return
    fetch('/api/agents?mine=true')
      .then((res) => res.json())
      .then((data) => setAgents(data.agents ?? []))
      .catch(() => setAgents([]))
  }, [open])

  useEffect(() => {
    if (!open) return
    fetch('/api/runtime-catalog')
      .then((res) => res.json())
      .then((data) => {
        setRuntimeCatalog(data)
        setGateways(Array.isArray(data.gateways) ? data.gateways : [])
      })
      .catch(() => {
        setRuntimeCatalog(null)
        setGateways([])
      })
  }, [open])

  useEffect(() => {
    if (!open || !runtimeCatalog || catalogDefaultsApplied) return
    const runtimes = Array.isArray(runtimeCatalog.runtimes) ? runtimeCatalog.runtimes : []
    const providers = Array.isArray(runtimeCatalog.providers) ? runtimeCatalog.providers : []
    const sourceStatus = runtimeCatalog.credentialSources && typeof runtimeCatalog.credentialSources === 'object'
      ? runtimeCatalog.credentialSources as Record<string, { present?: boolean }>
      : {}
    const runtimeOrder: RuntimeKind[] = ['codex', 'claude-code', 'opencode', 'gemini-cli']

    function providerIsCompatible(providerId: string, runtimeId: RuntimeKind) {
      const runtime = runtimes.find((item: any) => item.id === runtimeId)
      const provider = providers.find((item: any) => item.id === providerId)
      if (!runtime || !provider) return false
      if (Array.isArray(runtime.compatibleProviderIds) && runtime.compatibleProviderIds.includes(providerId)) return true
      if (Array.isArray(provider.compatibleRuntimeIds) && provider.compatibleRuntimeIds.includes(runtimeId)) return true
      return false
    }

    function providerHasCredential(providerId: string) {
      const provider = providers.find((item: any) => item.id === providerId)
      const keys = Array.isArray(provider?.credentialKeys) ? provider.credentialKeys : []
      return keys.length === 0 || keys.some((key: string) => sourceStatus[key]?.present)
    }

    let nextRuntime: RuntimeKind = 'codex'
    let nextProvider = 'openai-compatible'
    for (const runtimeId of runtimeOrder) {
      const runtime = runtimes.find((item: any) => item.id === runtimeId)
      const candidates = Array.from(new Set([
        ...(Array.isArray(runtime?.defaultProviderIds) ? runtime.defaultProviderIds : []),
        ...providers.filter((provider: any) => providerIsCompatible(provider.id, runtimeId)).map((provider: any) => provider.id),
      ]))
      const configured = candidates.find((providerId) => providerHasCredential(String(providerId)))
      if (configured) {
        nextRuntime = runtimeId
        nextProvider = String(configured)
        break
      }
    }

    const preset = RUNTIME_PRESETS.find((item) => item.kind === nextRuntime)
    const image = IMAGE_OPTIONS[nextRuntime][0]?.value ?? 'base'
    setRuntimeKind(nextRuntime)
    if (preset) setRuntimeCommand(preset.command)
    setImageChoice(image)
    setSandboxImage(image)
    applyLlmPreset(LLM_PRESET_BY_PROVIDER_TEMPLATE[nextProvider] ?? DEFAULT_LLM_FOR_RUNTIME[nextRuntime], nextRuntime)
    setCatalogDefaultsApplied(true)
  }, [catalogDefaultsApplied, open, runtimeCatalog])

  useEffect(() => {
    if (!open || !selectedAgentId) {
      setSelectedAgentDetail(null)
      return
    }

    let cancelled = false
    setAgentDetailLoading(true)
    fetch(`/api/agents/${encodeURIComponent(selectedAgentId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setSelectedAgentDetail(data.agent ?? null)
      })
      .catch(() => {
        if (!cancelled) setSelectedAgentDetail(null)
      })
      .finally(() => {
        if (!cancelled) setAgentDetailLoading(false)
      })
    return () => { cancelled = true }
  }, [open, selectedAgentId])

  useEffect(() => {
    if (!open || !selectedAgentDetail) return
    const graphPackage = normalizeRuntimePackage(selectedAgentDetail.runtimePackage)
    const missingGraphTools = inferredGraphTools.filter((tool) =>
      !graphPackage.tools.some((packagedTool) =>
        packagedTool.sourceNodeId === tool.sourceNodeId ||
        packagedTool.name.toLowerCase() === tool.name.toLowerCase(),
      ),
    )

    setEnvText(envToText({
      MCP_INTERNAL_URL: 'http://mcp-server:3100/mcp',
      MAP_RUNTIME_NAME: 'agent-runtime',
      ...graphPackage.env,
    }))
    setSecretEnvText((current) => JSON.stringify({
      ...tryParseSecretEnvMap(current),
      ...graphPackage.secretEnv,
    }, null, 2))
    setTools([...DEFAULT_TOOLS, ...graphPackage.tools, ...missingGraphTools].reduce((acc, tool) => appendTool(acc, tool), [] as ToolDraft[]))
    setScripts([
      ...DEFAULT_SCRIPTS,
      ...graphPackage.scripts.map((script) => ({ ...script, runOnStart: script.runOnStart === true })),
    ].reduce((acc, script) => appendScript(acc, script), [] as ScriptDraft[]))
    setFiles(
      missingGraphTools
        .map((tool) => runtimeToolStub(tool))
        .reduce(
          (acc, file) => appendFile(acc, file),
          [...DEFAULT_FILES, ...graphPackage.files].reduce((acc, file) => appendFile(acc, file), [] as FileDraft[]),
        ),
    )
    setPorts([...DEFAULT_PORTS, ...graphPackage.ports].reduce((acc, port) => appendPort(acc, port), [] as PortDraft[]))
    setConnections([...DEFAULT_CONNECTIONS, ...graphPackage.connections].reduce((acc, connection) => appendUniqueConnection(acc, [connection]), [] as ConnectionDraft[]))
  }, [inferredGraphTools, open, selectedAgentDetail])

  const endpointEnv = useMemo(() => parseEnvLines(llmEnvText), [llmEnvText])
  const packageEnv = useMemo(() => ({ ...parseEnvLines(envText), ...endpointEnv }), [endpointEnv, envText])
  const secretEnv = useMemo(() => tryParseSecretEnvMap(secretEnvText), [secretEnvText])
  const effectiveProviderMode = privacyRouteEnabled ? 'inference-local' : providerMode

  const runtimePackage: RuntimePackage = useMemo(() => ({
    env: packageEnv,
    secretEnv,
    tools,
    scripts,
    files,
    ports,
    connections,
    securityNotes: securityNotesText.split('\n').map((line) => line.trim()).filter(Boolean),
  }), [connections, files, packageEnv, ports, scripts, secretEnv, securityNotesText, tools])

  const providerInputs = useMemo<RuntimeProviderInput[]>(() => {
    const credentialKeys = Object.keys(secretEnv)
    return [{
      templateId: providerTemplateId,
      name: providerName,
      role: 'llm',
      mode: effectiveProviderMode,
      credentialKeys,
      env: endpointEnv,
      sourceEnv: secretEnv,
      endpoints: [providerConnection],
      credentialValues: hasPastedApiKey ? { [apiKeyRuntimeKey]: pastedApiKey } : undefined,
      attach: effectiveProviderMode !== 'direct' && effectiveProviderMode !== 'legacy-env',
      useForInference: effectiveProviderMode === 'inference-local',
    }]
  }, [apiKeyRuntimeKey, effectiveProviderMode, endpointEnv, hasPastedApiKey, pastedApiKey, providerConnection, providerName, providerTemplateId, secretEnv])

  const resourceLimits = useMemo(() => ({
    ...(cpuLimit.trim() ? { cpu: cpuLimit.trim() } : {}),
    ...(memoryLimit.trim() ? { memory: memoryLimit.trim() } : {}),
    ...(gpuEnabled ? { gpu: true } : {}),
  }), [cpuLimit, gpuEnabled, memoryLimit])

  useEffect(() => {
    if (!open) return
    setPreflightReport(null)
  }, [
    executionMode,
    gatewayId,
    name,
    open,
    apiKeySourceMode,
    policyMode,
    policyYaml,
    privacyRouteAcknowledged,
    privacyRouteEnabled,
    providerInputs,
    providerMode,
    resourceLimits,
    runtimeCommand,
    runtimeKind,
    runtimePackage,
    sandboxImage,
    selectedAgentId,
  ])

  const warnings = useMemo(() => {
    const items: string[] = []
    const promptText = `${selectedAgent?.name ?? ''} ${selectedAgent?.description ?? ''}`.toLowerCase()
    const policyLower = policyYaml.toLowerCase()
    const envKeys = Object.keys(runtimePackage.env).map((key) => key.toUpperCase())
    const connectionTargets = runtimePackage.connections.map((connection) => connection.target.toLowerCase()).join(' ')
    const hasNetwork = policyMode === 'generated' || (!policyLower.includes('network_policies: {}') && !policyLower.includes('network_policies:{}'))
    const llmTarget = runtimePackage.env.OPENAI_BASE_URL || runtimePackage.env.ANTHROPIC_BASE_URL || runtimePackage.env.AZURE_OPENAI_ENDPOINT
    const providerTargets = providerInputs.flatMap((provider) => provider.endpoints ?? []).map((connection) => connection.target)

    if (!selectedAgentId) items.push('Select the prompt that will be pinned into this sandbox.')
    if (!name.trim()) items.push('Give this runtime a deployment name.')
    if (!runtimeCommand.includes('{prompt}')) items.push('Runtime command does not reference {prompt}, so the pinned prompt may not be used.')
    if (!runtimeCommand.includes('{input}')) items.push('Runtime command does not reference {input}, so chat messages may not reach the CLI.')
    if (providerMode === 'legacy-env') items.push('Legacy env secret pass-through is selected. Use Providers v2 for shared or production sandboxes.')
    if (privacyRouteEnabled && !privacyRouteCompatible) items.push('Privacy router is enabled, but the selected CLI/provider cannot use inference.local.')
    if (privacyRouteEnabled && !privacyRouteAcknowledged) items.push('Privacy router is gateway-scoped. Confirm the selected gateway route before deployment.')
    if (!privacyRouteEnabled) items.push('Privacy router is off. Runtime traffic will use the configured endpoint directly if policy allows it.')
    if (runtimeKind === 'gemini-cli' && sandboxImage !== 'gemini') items.push('Gemini CLI normally uses the OpenShell community gemini image. Confirm this custom image includes the gemini binary.')
    if (runtimeKind === 'gemini-cli' && !['google-ai-studio', 'google-vertex-ai'].includes(providerTemplateId)) items.push('Gemini CLI needs Google AI Studio or Vertex AI provider metadata.')
    if (llmTarget && !hasNetwork) items.push('LLM endpoint is configured, but the selected OpenShell policy appears to block outbound network.')
    if (llmTarget && !hasConnection(runtimePackage.connections, llmTarget) && !providerTargets.some((target) => hasConnection([{ name: 'provider', target, direction: 'outbound' }], llmTarget))) {
      items.push('LLM endpoint is configured, but no matching provider or manual connection is declared.')
    }
    if (apiKeySourceMode === 'paste' && !hasPastedApiKey) {
      items.push(`Paste the ${apiKeyRuntimeKey} value before creating the sandbox.`)
    } else if (!hasPastedApiKey && apiKeyEnvName && apiKeySourceStatus?.present === false) {
      items.push(`${apiKeyEnvName} is not present on deployment-worker. Set that worker env var before creating the sandbox.`)
    }
    if (JSON.stringify(secretEnv).includes('YOUR_WORKER_SECRET_ENV')) items.push('Secret pass-through still uses the placeholder YOUR_WORKER_SECRET_ENV.')
    if (Object.values(runtimePackage.env).some((value) => value.includes('your-'))) items.push('Endpoint or model env still contains placeholder values.')
    if (/(database|postgres|mysql|supabase|sql|warehouse|db)/i.test(promptText)) {
      const hasDbEnv = envKeys.some((key) => ['DATABASE_URL', 'DB_HOST', 'POSTGRES_URL', 'SUPABASE_URL'].includes(key))
      const hasDbConnection = /(postgres|mysql|database|supabase|5432|3306)/i.test(connectionTargets)
      if (!hasDbEnv) items.push('Prompt appears to need database access, but no database env variable is configured.')
      if (!hasDbConnection) items.push('Prompt appears to need database access, but no database connection is declared.')
      if (!hasNetwork) items.push('Prompt appears to need database/API access, but outbound network is not enabled in policy.')
    }
    if (/(api|http|webhook|shopify|stripe|crm|zendesk|salesforce|endpoint|fetch)/i.test(promptText) && runtimePackage.connections.length <= 1) {
      items.push('Prompt appears to call an external API, but only the default MAP MCP connection is declared.')
    }
    if (runtimePackage.tools.length === 0) items.push('No tools are shipped with this runtime.')
    for (const tool of runtimePackage.tools) {
      if (tool.sourceType === 'graph' && !tool.command.trim()) {
        items.push(`${tool.name} was detected in the prompt graph, but no runtime command is configured yet.`)
      } else if (tool.needsImplementation) {
        items.push(`${tool.name} is marked as needing implementation. Connect it to a Python, JavaScript, shell, API, or other runtime command before deployment.`)
      }
    }
    if (runtimePackage.files.length === 0) items.push('No extra files are packaged. That is fine for simple agents, but confirm the prompt does not expect local files.')

    return items
  }, [apiKeyEnvName, apiKeyRuntimeKey, apiKeySourceMode, apiKeySourceStatus?.present, hasPastedApiKey, name, policyMode, policyYaml, privacyRouteAcknowledged, privacyRouteCompatible, privacyRouteEnabled, providerInputs, providerMode, providerTemplateId, runtimeCommand, runtimeKind, runtimePackage, sandboxImage, secretEnv, selectedAgent, selectedAgentId])

  function applyLlmPreset(next: LlmPresetKey, _runtimeForProvider: RuntimeKind = runtimeKind) {
    const preset = LLM_PRESETS[next]
    const providerTemplate = PROVIDER_TEMPLATE_BY_LLM_PRESET[next]
    setLlmPreset(next)
    setLlmEnvText(preset.env)
    setSecretEnvText(preset.secrets)
    setProviderTemplateId(providerTemplate)
    setProviderName(`map-${providerTemplate}`)
    setApiKeySourceMode('worker-env')
    setApiKeyValue('')
    setPrivacyRouteEnabled(false)
    setPrivacyRouteAcknowledged(false)
    if (next === 'custom') setProviderMode('direct')
    else setProviderMode('providers-v2')
  }

  function handleRuntimeChange(value: string) {
    const nextKind = value as RuntimeKind
    const preset = RUNTIME_PRESETS.find((item) => item.kind === nextKind)
    const nextImage = IMAGE_OPTIONS[nextKind][0]?.value ?? 'base'
    const runtime = Array.isArray(runtimeCatalog?.runtimes)
      ? runtimeCatalog.runtimes.find((item: any) => item.id === nextKind)
      : null
    const defaultProviderId = Array.isArray(runtime?.defaultProviderIds) && runtime.defaultProviderIds[0]
      ? runtime.defaultProviderIds[0]
      : PROVIDER_TEMPLATE_BY_LLM_PRESET[DEFAULT_LLM_FOR_RUNTIME[nextKind]]
    const nextProvider = LLM_PRESET_BY_PROVIDER_TEMPLATE[String(defaultProviderId)] ?? DEFAULT_LLM_FOR_RUNTIME[nextKind]
    setRuntimeKind(nextKind)
    setImageChoice(nextImage)
    setSandboxImage(nextImage)
    if (preset) setRuntimeCommand(preset.command)
    applyLlmPreset(nextProvider, nextKind)
  }

  function handleSecurityPreset(value: string) {
    setSecurityPreset(value)
    if (value === 'generated') {
      setPolicyMode('generated')
      setPolicyYaml('')
    }
    if (value === 'locked') {
      setPolicyMode('locked')
      setPolicyYaml(LOCKED_POLICY)
    }
    if (value === 'custom') {
      setPolicyMode('custom')
      setPolicyYaml(policyYaml || DEFAULT_POLICY)
    }
    if (value === 'networked') {
      setPolicyMode('custom')
      setPolicyYaml(NETWORKED_POLICY)
    }
  }

  function handleLlmPreset(value: string) {
    const next = value as LlmPresetKey
    if (!compatibleLlmPresets.includes(next)) {
      toast.error(`${LLM_PRESETS[next].label} is not compatible with ${RUNTIME_PRESETS.find((preset) => preset.kind === runtimeKind)?.label ?? runtimeKind}`)
      return
    }
    applyLlmPreset(next)
  }

  function handleModelChange(value: string) {
    setLlmEnvText((current) => setEnvValue(current, modelEnvKeyForPreset(llmPreset), value))
  }

  function handleEndpointChange(value: string) {
    const key = endpointEnvKeyForPreset(llmPreset)
    if (key) setLlmEnvText((current) => setEnvValue(current, key, value))
    setConnections((current) => current.map((connection) => (
      connection.name === LLM_PRESETS[llmPreset].connection.name
        ? { ...connection, target: value || connection.target }
        : connection
    )))
  }

  function applyInferenceLocalEnv(presetKey: LlmPresetKey = llmPreset, providerId = providerTemplateId, secretText = secretEnvText) {
    const endpointKey = endpointEnvKeyForPreset(presetKey)
    const provider = Array.isArray(runtimeCatalog?.providers)
      ? runtimeCatalog.providers.find((item: any) => item.id === providerId)
      : null
    const apiKey = provider?.apiKeyEnvKey || Object.keys(tryParseSecretEnvMap(secretText))[0] || 'OPENAI_API_KEY'
    setLlmEnvText((current) => {
      let next = current
      if (endpointKey === 'ANTHROPIC_BASE_URL') next = setEnvValue(next, endpointKey, 'https://inference.local')
      else if (endpointKey) next = setEnvValue(next, endpointKey, 'https://inference.local/v1')
      next = setEnvValue(next, apiKey, 'unused')
      return next
    })
  }

  function resetDirectEndpointEnv() {
    const preset = LLM_PRESETS[llmPreset]
    setLlmEnvText(preset.env)
  }

  function handlePrivacyRouteChange(value: string) {
    const enabled = value === 'true'
    setPrivacyRouteEnabled(enabled)
    setPrivacyRouteAcknowledged(false)
    if (enabled) {
      if (!privacyRouteCompatible) {
        toast.error('This runtime/provider cannot use inference.local. Choose a compatible runtime or provider.')
        setPrivacyRouteEnabled(false)
        setProviderMode('providers-v2')
        return
      }
      setProviderMode('inference-local')
      applyInferenceLocalEnv()
      return
    }
    setProviderMode(providerTemplateId === 'custom-api' ? 'direct' : 'providers-v2')
    resetDirectEndpointEnv()
  }

  function handleApiKeyEnvChange(value: string) {
    setSecretEnvText((current) => rewriteSecretSource(current, value))
  }

  function handleProviderTemplateChange(value: string) {
    const provider = Array.isArray(runtimeCatalog?.providers)
      ? runtimeCatalog.providers.find((item: any) => item.id === value)
      : null
    const nextPreset = LLM_PRESET_BY_PROVIDER_TEMPLATE[value] ?? 'custom'
    if (!provider) {
      applyLlmPreset(nextPreset)
      return
    }

    const credentialKeys = Array.isArray(provider.credentialKeys) ? provider.credentialKeys : []
    const sourceKey = provider.apiKeyEnvKey || credentialKeys[0] || 'API_KEY'
    setLlmPreset(nextPreset)
    setLlmEnvText(envToText(provider.env ?? {}))
    setSecretEnvText(JSON.stringify(Object.fromEntries(credentialKeys.map((key: string) => [key, sourceKey])), null, 2))
    setProviderTemplateId(value)
    setProviderName(`map-${value}`)
    setApiKeySourceMode('worker-env')
    setApiKeyValue('')
    setPrivacyRouteEnabled(false)
    setPrivacyRouteAcknowledged(false)
    setProviderMode(provider.mode === 'direct' ? 'direct' : 'providers-v2')
  }

  function handleImageChoice(value: string) {
    setImageChoice(value)
    const next = value === 'custom' ? '' : value
    setSandboxImage(next)
  }

  function addEnvLine(key: string, value: string) {
    const current = parseEnvLines(envText)
    setEnvText(envToText({ ...current, [key]: value }))
  }

  function addConnection(next: ConnectionDraft) {
    setConnections((current) => appendUniqueConnection(current, [next]))
  }

  function buildRuntimePackage(): RuntimePackage {
    return {
      ...runtimePackage,
      secretEnv: parseSecretEnvMap(secretEnvText),
    }
  }

  function buildDeploymentPayload(packageInput = buildRuntimePackage()) {
    return {
      agentId: selectedAgentId,
      name,
      runtimeKind,
      runtimeId: runtimeKind,
      gatewayId,
      runtimeCommand,
      runtimePackage: packageInput,
      policyYaml: policyMode === 'generated' ? '' : policyYaml,
      policyMode,
      sandboxImage: sandboxImage.trim() || (runtimeKind === 'gemini-cli' ? 'gemini' : 'base'),
      executionMode,
      providerMode: privacyRouteEnabled ? 'inference-local' : providerMode,
      providers: providerInputs,
      resources: resourceLimits,
      environment: {
        MAP_ENVIRONMENT: 'development',
      },
    }
  }

  async function createGateway() {
    if (!newGatewayName.trim() || !newGatewayEndpoint.trim()) {
      toast.error('Gateway name and endpoint are required')
      return
    }
    setCreatingGateway(true)
    try {
      const res = await fetch('/api/runtime-gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGatewayName,
          endpoint: newGatewayEndpoint,
          mode: newGatewayMode,
          authMode: newGatewayMode === 'local-docker' ? 'local' : 'mtls',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to create gateway')
      if (data.gateway) {
        setGateways((current) => [...current.filter((gateway) => gateway.id !== data.gateway.id), data.gateway])
        setGatewayId(data.gateway.id)
      }
      setNewGatewayName('')
      setNewGatewayEndpoint('')
      toast.success(data.verification?.status === 'ready' ? 'Gateway created and verified' : 'Gateway created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create gateway')
    } finally {
      setCreatingGateway(false)
    }
  }

  async function runPreflight() {
    if (!selectedAgentId) return
    setPreflightLoading(true)
    try {
      const res = await fetch('/api/deployments/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDeploymentPayload()),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Preflight failed')
      setPreflightReport(data.report ?? null)
    } catch (err) {
      setPreflightReport(null)
      toast.error(err instanceof Error ? err.message : 'Preflight failed')
    } finally {
      setPreflightLoading(false)
    }
  }

  async function handleSubmit() {
    if (!runtimeEnabled) {
      toast.error('OpenShell runtime is disabled in config')
      return
    }
    if (!selectedAgentId) {
      toast.error('Choose a prompt to deploy')
      setStep('runtime')
      return
    }
    if (privacyRouteEnabled && (!privacyRouteCompatible || !privacyRouteAcknowledged)) {
      toast.error('Confirm the gateway privacy route before deployment')
      setStep('runtime')
      return
    }
    if (!preflightReport?.ok) {
      toast.error('Run a passing preflight before creating the sandbox')
      setStep('review')
      return
    }
    setSaving(true)
    try {
      const packageInput = buildRuntimePackage()
      const res = await fetch('/api/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDeploymentPayload(packageInput)),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to create deployment')
      toast.success(data.workerError ? 'Deployment saved with worker error' : 'Deployment created')
      if (data.workerError) toast.error(data.workerError)
      onCreated?.(data.deployment)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create deployment')
    } finally {
      setSaving(false)
    }
  }

  function goNext() {
    const nextStep = STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id
    setStep(nextStep)
    if (nextStep === 'review') void runPreflight()
  }

  function goBack() {
    setStep(STEPS[Math.max(0, stepIndex - 1)].id)
  }

  const packageManifest = JSON.stringify(runtimePackage, null, 2)
  const activeStep = STEPS[stepIndex]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,900px)] w-[calc(100vw-2rem)] max-w-none flex-col overflow-hidden p-0 sm:max-w-[1180px]">
        <DialogHeader className="border-b border-border/50 px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            Create OpenShell Agent Runtime
          </DialogTitle>
          {!runtimeEnabled && (
            <p className="text-sm text-destructive">
              OpenShell runtime is disabled. Set OPENSHELL_RUNTIME_ENABLED=true to create or operate sandboxes.
            </p>
          )}
        </DialogHeader>

        <div className="border-b border-border/50 px-6 py-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {STEPS.map((item, index) => {
              const isActive = item.id === step
              const isDone = index < stepIndex
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStep(item.id)}
                  className={`min-w-0 rounded-md border px-3 py-3 text-left transition-colors ${
                    isActive
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : isDone
                        ? 'border-green-500/30 bg-green-500/5'
                        : 'border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {isDone ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <span className="text-xs">{index + 1}</span>}
                    {item.label}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.description}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 'gateway' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0 space-y-4">
                <SectionTitle
                  icon={Network}
                  title="Connect an OpenShell gateway"
                  description="The gateway is the control plane. MAP registers and verifies an existing gateway before creating any sandbox."
                />

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="grid gap-2">
                    <LabelWithInfo info="Choose the OpenShell gateway that owns sandbox lifecycle, auth, provider records, policy delivery, and inference routing.">
                      Gateway
                    </LabelWithInfo>
                    <Select value={gatewayId} onValueChange={setGatewayId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(gateways.length > 0 ? gateways : [selectedGateway]).map((gateway) => (
                          <SelectItem key={gateway.id} value={gateway.id}>
                            {gateway.label} · {gateway.mode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <SummaryRow
                    label="Selected endpoint"
                    value={<code className="block truncate text-xs">{selectedGateway.endpoint}</code>}
                  />
                </div>

                <div className="space-y-3 rounded-md border border-border/50 p-3">
                  <SectionTitle
                    icon={Plug}
                    title="Register existing gateway"
                    description="Add a gateway endpoint MAP can verify. v1 does not provision Docker or Helm gateways from the UI."
                  />
                  <div className="grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)_180px_auto]">
                    <Input
                      value={newGatewayName}
                      onChange={(event) => setNewGatewayName(event.target.value)}
                      placeholder="Gateway name"
                    />
                    <Input
                      value={newGatewayEndpoint}
                      onChange={(event) => setNewGatewayEndpoint(event.target.value)}
                      placeholder="https://openshell-gateway.example.com"
                      className="font-mono text-xs"
                    />
                    <Select value={newGatewayMode} onValueChange={(value) => setNewGatewayMode(value as RuntimeGatewayProfile['mode'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local-docker">Local Docker</SelectItem>
                        <SelectItem value="remote-docker">Remote Docker</SelectItem>
                        <SelectItem value="kubernetes">Kubernetes</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={createGateway} disabled={creatingGateway}>
                      {creatingGateway ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Network className="mr-2 h-4 w-4" />}
                      Add
                    </Button>
                  </div>
                </div>
              </section>

              <aside className="min-w-0 space-y-3">
                <SummaryRow label="Gateway" value={`${selectedGateway.label} (${selectedGateway.id})`} />
                <SummaryRow label="Auth / mode" value={`${selectedGateway.authMode ?? 'local'} · ${selectedGateway.mode}`} />
                <SummaryRow label="Connectivity" value={gatewayCheck ? `${gatewayCheck.status}: ${gatewayCheck.label}` : 'Not verified yet'} />
                <SummaryRow label="Providers v2" value={providersV2Check ? `${providersV2Check.status}: ${providersV2Check.label}` : 'Unknown'} />
                <SummaryRow
                  label="Setup checks"
                  value={
                    <div className="space-y-1">
                      {setupChecks.length > 0
                        ? setupChecks.slice(0, 8).map((check: any) => (
                          <div key={check.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{check.label}</span>
                            <Badge variant="outline" className="text-[10px]">{check.status}</Badge>
                          </div>
                        ))
                        : <span className="text-xs text-muted-foreground">Worker setup unavailable</span>}
                    </div>
                  }
                />
              </aside>
            </div>
          )}

          {step === 'runtime' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0 space-y-4">
                <SectionTitle
                  icon={Rocket}
                  title="Choose prompt, runtime, and model"
                  description="Pick the MAP prompt, CLI runtime, compatible model endpoint, and worker env var used for provider credentials."
                />

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="grid gap-2">
                    <Label>Prompt to pin</Label>
                    <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose prompt" />
                      </SelectTrigger>
                      <SelectContent>
                        {(agentId && agentName && !agents.some((agent) => agent.id === agentId)
                          ? [{ id: agentId, name: agentName }, ...agents]
                          : agents
                        ).map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="deployment-name">Deployment name</Label>
                    <Input id="deployment-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Support triage sandbox" />
                  </div>
                </div>

                <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {agentDetailLoading ? 'Scanning prompt graph...' : `${inferredGraphTools.length} graph tool(s) detected`}
                    </Badge>
                    {inferredGraphTools.slice(0, 8).map((tool) => (
                      <Badge key={tool.name} variant="secondary" className="text-[10px]">
                        {tool.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/20 p-3">
                  <div>
                    <div className="text-sm font-semibold">Setup mode</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Simple shows runtime, provider, model, endpoint, and API key. Advanced adds image, resources, provider mode, and raw OpenShell controls.
                    </p>
                  </div>
                  <div className="inline-flex rounded-md border border-border/60 bg-background p-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={setupMode === 'simple' ? 'default' : 'ghost'}
                      className="h-8"
                      onClick={() => setSetupMode('simple')}
                    >
                      Simple
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={setupMode === 'advanced' ? 'default' : 'ghost'}
                      className="h-8"
                      onClick={() => setSetupMode('advanced')}
                    >
                      Advanced
                    </Button>
                  </div>
                </div>

                <div className={`grid gap-3 ${setupMode === 'advanced' ? 'lg:grid-cols-[240px_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}`}>
                  <div className="grid min-w-0 gap-2">
                    <LabelWithInfo info="The CLI installed in the sandbox. It receives the MAP prompt and each chat message.">
                      CLI runtime
                    </LabelWithInfo>
                    <Select value={runtimeKind} onValueChange={handleRuntimeChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RUNTIME_PRESETS.map((preset) => (
                          <SelectItem key={preset.kind} value={preset.kind}>{preset.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {setupMode === 'advanced' ? (
                  <div className="grid gap-2">
                    <LabelWithInfo htmlFor="runtime-command" info="Advanced shell command. MAP replaces {prompt} and {input} with files inside /sandbox/map.">
                      Command template
                    </LabelWithInfo>
                    <Input
                      id="runtime-command"
                      value={runtimeCommand}
                      onChange={(event) => setRuntimeCommand(event.target.value)}
                      className="min-w-0 font-mono text-xs"
                    />
                  </div>
                  ) : (
                    <div className="grid gap-2">
                      <LabelWithInfo info="The AI API family this CLI can call. Incompatible choices are hidden.">
                        AI provider
                      </LabelWithInfo>
                      <Select value={llmPreset} onValueChange={handleLlmPreset}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {compatibleLlmPresets.map((key) => (
                            <SelectItem key={key} value={key}>{LLM_PRESETS[key].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {setupMode === 'advanced' && (
                <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                  MAP resolves <span className="font-mono text-foreground">{'{prompt}'}</span> to <span className="font-mono text-foreground">/sandbox/map/prompt.md</span> and <span className="font-mono text-foreground">{'{input}'}</span> to <span className="font-mono text-foreground">/sandbox/map/input.txt</span>.
                </div>
                )}

                {setupMode === 'advanced' && (
                  <div className="space-y-4 rounded-md border border-border/50 p-3">
                    <SectionTitle
                      icon={Wrench}
                      title="Advanced runtime controls"
                      description="Use these when the default image, resource limits, or OpenShell provider behavior needs to be explicit."
                    />

                    <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
                      <div className="grid gap-2">
                        <LabelWithInfo info="The container image OpenShell uses to create the sandbox. It must contain the selected CLI binary.">
                          Sandbox image
                        </LabelWithInfo>
                        <Select value={imageChoice} onValueChange={handleImageChoice}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {IMAGE_OPTIONS[runtimeKind].map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="sandbox-image">Image name</Label>
                        <Input
                          id="sandbox-image"
                          value={sandboxImage}
                          onChange={(event) => {
                            setImageChoice('custom')
                            setSandboxImage(event.target.value)
                          }}
                          className="font-mono text-xs"
                          placeholder={runtimeKind === 'gemini-cli' ? 'gemini' : 'base'}
                        />
                        <p className="text-xs text-muted-foreground">
                          {selectedImageOption?.description ?? 'Use an image available to the selected OpenShell gateway.'}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="grid gap-2">
                        <LabelWithInfo info="One-shot chat runs one command per message. Interactive/service modes are for terminal or long-running workflows.">
                          Execution mode
                        </LabelWithInfo>
                        <Select value={executionMode} onValueChange={(value) => setExecutionMode(value as ExecutionMode)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="oneshot">One-shot chat</SelectItem>
                            <SelectItem value="interactive">Interactive CLI</SelectItem>
                            <SelectItem value="service">Service runtime</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <LabelWithInfo info="How OpenShell attaches credentials and routes model traffic. Providers v2 is the normal safe default.">
                          Provider mode
                        </LabelWithInfo>
                        <Select value={providerMode} onValueChange={(value) => setProviderMode(value as ProviderMode)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="providers-v2">Providers v2</SelectItem>
                            <SelectItem value="inference-local">inference.local</SelectItem>
                            <SelectItem value="direct">Direct endpoint</SelectItem>
                            <SelectItem value="legacy-env">Legacy env</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <LabelWithInfo info="Logical OpenShell provider profile attached to this sandbox. Usually auto-selected from the AI provider.">
                          Provider profile
                        </LabelWithInfo>
                        <Select value={providerTemplateId} onValueChange={handleProviderTemplateChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PROVIDER_TEMPLATE_LABELS.map(([id, label]) => (
                              <SelectItem key={id} value={id}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px_160px]">
                      <div className="grid gap-2">
                        <LabelWithInfo htmlFor="provider-name" info="Internal name for the provider profile. This is metadata, not the model name.">
                          Provider name
                        </LabelWithInfo>
                        <Input
                          id="provider-name"
                          value={providerName}
                          onChange={(event) => setProviderName(event.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="grid gap-2">
                        <LabelWithInfo htmlFor="cpu-limit" info="Maximum CPU available to this sandbox. Leave blank for the gateway default.">
                          CPU
                        </LabelWithInfo>
                        <Input id="cpu-limit" value={cpuLimit} onChange={(event) => setCpuLimit(event.target.value)} placeholder="2" />
                      </div>
                      <div className="grid gap-2">
                        <LabelWithInfo htmlFor="memory-limit" info="Maximum RAM for this sandbox, for example 4Gi or 8192Mi. Leave blank for default.">
                          Memory
                        </LabelWithInfo>
                        <Input id="memory-limit" value={memoryLimit} onChange={(event) => setMemoryLimit(event.target.value)} placeholder="4Gi" />
                      </div>
                      <div className="grid gap-2">
                        <LabelWithInfo info="Request GPU access only for local inference or GPU tools. Remote API CLIs usually do not need it.">
                          GPU
                        </LabelWithInfo>
                        <Select value={gpuEnabled ? 'true' : 'false'} onValueChange={(value) => setGpuEnabled(value === 'true')}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">Disabled</SelectItem>
                            <SelectItem value="true">Request GPU</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                <SectionTitle
                  icon={KeyRound}
                  title="Select model endpoint and API key"
                  description="Only compatible providers are shown for the selected CLI. API key values stay outside MAP; the sandbox receives a provider profile or env mapping."
                />

                <div className="grid gap-3 lg:grid-cols-2">
                  {setupMode === 'advanced' && (
                    <div className="grid min-w-0 gap-2">
                      <LabelWithInfo info="The API family and default endpoint/model env for this runtime. Choices are filtered by CLI compatibility.">
                        AI provider
                      </LabelWithInfo>
                      <Select value={llmPreset} onValueChange={handleLlmPreset}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {compatibleLlmPresets.map((key) => (
                            <SelectItem key={key} value={key}>{LLM_PRESETS[key].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid min-w-0 gap-2">
                    <LabelWithInfo info="The model or deployment name passed to the selected provider. Pick a preset or type your own.">
                      Model
                    </LabelWithInfo>
                    <Select
                      value={catalogModelOptions.includes(selectedModel) ? selectedModel : 'custom-model'}
                      onValueChange={(value) => handleModelChange(value)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {catalogModelOptions.map((model) => (
                          <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <LabelWithInfo htmlFor="model-name" info="Use this when the exact model/deployment is not in the preset list.">
                      Model name
                    </LabelWithInfo>
                    <Input
                      id="model-name"
                      value={selectedModel}
                      onChange={(event) => handleModelChange(event.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="grid gap-2">
                    <LabelWithInfo htmlFor="endpoint-url" info="The API base URL or provider endpoint. Default presets fill this automatically; custom endpoints can be pasted here.">
                      API endpoint
                    </LabelWithInfo>
                    <Input
                      id="endpoint-url"
                      value={selectedEndpoint}
                      onChange={(event) => handleEndpointChange(event.target.value)}
                      className="font-mono text-xs"
                      placeholder="https://api.example.com/v1"
                      disabled={!endpointEnvKey}
                    />
                  </div>
                  <div className="grid gap-2">
                    <LabelWithInfo info="Use a deployment-worker environment variable, or paste a one-time key for this sandbox creation. Pasted values are sent to the worker as provider credentials, not stored in the runtime package.">
                      API key source
                    </LabelWithInfo>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={apiKeySourceMode === 'worker-env' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setApiKeySourceMode('worker-env')}
                      >
                        Worker env var
                      </Button>
                      <Button
                        type="button"
                        variant={apiKeySourceMode === 'paste' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setApiKeySourceMode('paste')}
                      >
                        <KeyRound className="mr-2 h-4 w-4" />
                        Paste key
                      </Button>
                    </div>

                    {apiKeySourceMode === 'paste' ? (
                      <Input
                        id="api-key-value"
                        type="password"
                        value={apiKeyValue}
                        onChange={(event) => setApiKeyValue(event.target.value)}
                        className="font-mono text-xs"
                        placeholder={`${apiKeyRuntimeKey} value`}
                        autoComplete="new-password"
                        spellCheck={false}
                      />
                    ) : setupMode === 'advanced' ? (
                        <Input
                          id="api-key-env"
                          value={apiKeyEnvName}
                          onChange={(event) => handleApiKeyEnvChange(event.target.value)}
                          className="font-mono text-xs"
                          placeholder={apiKeyRuntimeKey}
                        />
                    ) : (
                      <Select value={apiKeyEnvName || apiKeyRuntimeKey} onValueChange={handleApiKeyEnvChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {credentialSourceOptions.map((source) => (
                            <SelectItem key={source} value={source}>
                              {source} · {credentialSources[source]?.present ? 'present' : 'missing'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <p className={`text-xs ${hasPastedApiKey || apiKeySourceStatus?.present ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {apiKeySourceMode === 'paste'
                        ? (hasPastedApiKey
                            ? `${apiKeyRuntimeKey} will be sent once as a provider credential for this sandbox.`
                            : `Paste the ${apiKeyRuntimeKey} value for this sandbox.`)
                        : (apiKeyEnvName
                            ? `${apiKeyEnvName} is ${apiKeySourceStatus?.present ? 'present' : 'missing'} on deployment-worker.`
                            : 'Choose the worker env var that holds this provider key.')}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 rounded-md border border-border/50 bg-muted/10 p-3">
                  <SectionTitle
                    icon={ShieldCheck}
                    title="Model traffic"
                    description="Direct endpoint is the default. Use inference.local only when this gateway/provider pair should route model calls through OpenShell."
                  />
                  <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="grid gap-2">
                      <LabelWithInfo info="When enabled, the sandbox calls https://inference.local and OpenShell routes through the selected provider/model.">
                        Route mode
                      </LabelWithInfo>
                      <Select value={privacyRouteEnabled ? 'true' : 'false'} onValueChange={handlePrivacyRouteChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">Direct endpoint</SelectItem>
                          <SelectItem value="true" disabled={!privacyRouteCompatible}>inference.local</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <SummaryRow
                        label="Compatibility"
                        value={privacyRouteCompatible ? 'inference.local is available for this runtime/provider' : 'Direct endpoint only for this runtime/provider'}
                      />
                    </div>
                  </div>
                  {privacyRouteEnabled && (
                    <div className="space-y-3 rounded-md border border-border/50 bg-background p-3">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <SummaryRow label="Gateway" value={`${selectedGateway.label} (${selectedGateway.id})`} />
                        <SummaryRow label="Route reported by worker" value={inferenceRoute ? JSON.stringify(inferenceRoute) : 'No route reported'} />
                        <SummaryRow label="Provider" value={providerName} />
                        <SummaryRow label="Model" value={selectedModel} />
                      </div>
                      <Button
                        type="button"
                        variant={privacyRouteAcknowledged ? 'default' : 'outline'}
                        onClick={() => setPrivacyRouteAcknowledged(true)}
                        disabled={!privacyRouteCompatible}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Confirm gateway privacy route
                      </Button>
                    </div>
                  )}
                </div>

                {setupMode === 'advanced' && (
                  <div className="space-y-3 rounded-md border border-border/50 p-3">
                    <SectionTitle
                      icon={KeyRound}
                      title="Advanced endpoint env"
                      description="These are the exact non-secret env values and secret mappings generated from the simple fields."
                    />
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="llm-env">Endpoint and model env</Label>
                        <Textarea
                          id="llm-env"
                          value={llmEnvText}
                          onChange={(event) => {
                            setLlmPreset('custom')
                            setLlmEnvText(event.target.value)
                          }}
                          className={`min-h-32 resize-y ${CODE_TEXTAREA_CLASS}`}
                          spellCheck={false}
                          wrap="off"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="secret-env">Secret pass-through</Label>
                        <Textarea
                          id="secret-env"
                          value={secretEnvText}
                          onChange={(event) => {
                            setLlmPreset('custom')
                            setSecretEnvText(event.target.value)
                          }}
                          className={`min-h-32 resize-y ${CODE_TEXTAREA_CLASS}`}
                          spellCheck={false}
                          wrap="off"
                        />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Left side is visible inside the sandbox. Right side is the variable name that must exist on deployment-worker.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <aside className="min-w-0 space-y-3">
                <SummaryRow label="Runtime sees" value={<code className="block truncate text-xs">{runtimeCommand}</code>} />
                <SummaryRow label="Gateway" value={`${selectedGateway.label} (${selectedGateway.id})`} />
                <SummaryRow label="Image" value={<code className="text-xs">{sandboxImage || 'base'}</code>} />
                <SummaryRow label="Provider mode" value={`${providerMode} (${providerTemplateId})`} />
                <SummaryRow
                  label="LLM endpoint"
                  value={
                    <div className="min-w-0 truncate text-xs font-mono">
                      {(runtimePackage.env.OPENAI_BASE_URL || runtimePackage.env.ANTHROPIC_BASE_URL || runtimePackage.env.AZURE_OPENAI_ENDPOINT || 'No endpoint configured')}
                    </div>
                  }
                />
                <SummaryRow
                  label="Secrets injected"
                  value={
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(secretEnv).length === 0
                        ? <span className="text-xs text-muted-foreground">None</span>
                        : Object.entries(secretEnv).map(([runtimeKey, sourceKey]) => (
                          <Badge key={runtimeKey} variant="outline" className="text-[10px]">
                            {runtimeKey} from {sourceKey}
                          </Badge>
                      ))}
                    </div>
                  }
                />
                <SummaryRow
                  label="Setup checks"
                  value={
                    <div className="space-y-1">
                      {Array.isArray(runtimeCatalog?.setup?.checks) && runtimeCatalog.setup.checks.length > 0
                        ? runtimeCatalog.setup.checks.slice(0, 6).map((check: any) => (
                          <div key={check.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{check.label}</span>
                            <Badge variant="outline" className="text-[10px]">{check.status}</Badge>
                          </div>
                        ))
                        : <span className="text-xs text-muted-foreground">Worker setup unavailable</span>}
                    </div>
                  }
                />
              </aside>
            </div>
          )}

          {step === 'policy' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0 space-y-4">
                <SectionTitle
                  icon={ShieldCheck}
                  title="Define what the sandbox can reach"
                  description="Generated policy turns selected providers and declared connections into OpenShell network rules. Locked and custom modes send explicit YAML."
                />

                <div className="grid gap-2">
                  <Label>Policy mode</Label>
                  <Select value={securityPreset} onValueChange={handleSecurityPreset}>
                    <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="generated">Generated from selections</SelectItem>
                      <SelectItem value="locked">Locked down</SelectItem>
                      <SelectItem value="custom">Custom YAML</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Generated mode is recommended for plug-and-play sandboxes. MAP will include the selected provider endpoint, MAP MCP, and manual outbound connections in preflight and creation.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Quick connections</Label>
                  <div className="flex flex-wrap gap-2">
                    <PillButton onClick={() => addConnection(DEFAULT_CONNECTIONS[0])}><Plug className="mr-1.5 h-3.5 w-3.5" /> MAP MCP</PillButton>
                    <PillButton onClick={() => addConnection(providerConnection)}><Globe2 className="mr-1.5 h-3.5 w-3.5" /> Extra LLM route</PillButton>
                    <PillButton onClick={() => addConnection({ name: 'Postgres', target: 'postgres://postgres:5432', direction: 'outbound', description: 'Database access' })}><Database className="mr-1.5 h-3.5 w-3.5" /> Postgres</PillButton>
                    <PillButton onClick={() => addConnection({ name: 'External API', target: 'https://api.example.com', direction: 'outbound', description: 'Replace with your API endpoint' })}><Network className="mr-1.5 h-3.5 w-3.5" /> HTTP API</PillButton>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Declared connections</Label>
                  <div className="space-y-2">
                    {connections.map((connection, index) => (
                      <div key={`${connection.name}-${index}`} className="grid gap-2 rounded-md border border-border/50 bg-muted/20 p-3 lg:grid-cols-[160px_minmax(0,1fr)_110px_auto]">
                        <Input value={connection.name} onChange={(event) => setConnections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
                        <Input value={connection.target} onChange={(event) => setConnections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, target: event.target.value } : item))} className="font-mono text-xs" />
                        <Select value={connection.direction} onValueChange={(value) => setConnections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, direction: value as 'outbound' | 'inbound' } : item))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="outbound">Outbound</SelectItem>
                            <SelectItem value="inbound">Inbound</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => setConnections((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="policy-yaml">OpenShell policy YAML</Label>
                    <Button type="button" size="sm" variant="ghost" onClick={() => {
                      if (policyMode === 'generated') {
                        setSecurityPreset('custom')
                        setPolicyMode('custom')
                        setPolicyYaml(DEFAULT_POLICY)
                      }
                      setAdvancedOpen(advancedOpen === 'policy' ? null : 'policy')
                    }}>
                      {advancedOpen === 'policy' ? 'Hide YAML' : 'Edit YAML'}
                    </Button>
                  </div>
                  {policyMode === 'generated' && advancedOpen !== 'policy' ? (
                    <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                      Policy YAML will be generated during preflight from the selected provider profile and declared connections.
                    </div>
                  ) : advancedOpen === 'policy' ? (
                    <Textarea
                      id="policy-yaml"
                      value={policyYaml}
                      onChange={(event) => {
                        setSecurityPreset('custom')
                        setPolicyYaml(event.target.value)
                      }}
                      className={`min-h-72 resize-y ${CODE_TEXTAREA_CLASS}`}
                      spellCheck={false}
                      wrap="off"
                    />
                  ) : (
                    <pre className="max-h-48 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 text-xs whitespace-pre-wrap">{policyYaml}</pre>
                  )}
                </div>
              </section>

              <aside className="min-w-0 space-y-3">
                <SummaryRow label="Policy mode" value={policyMode} />
                <SummaryRow
                  label="Connections"
                  value={<div className="space-y-1">{connections.map((connection) => <div key={`${connection.name}-${connection.target}`} className="truncate text-xs">{connection.name}: {connection.target}</div>)}</div>}
                />
                <SummaryRow
                  label="Network status"
                  value={policyMode === 'generated' ? 'Generated from selected providers/connections' : policyYaml.includes('network_policies: {}') ? 'Outbound appears blocked' : 'Outbound configured in policy'}
                />
              </aside>
            </div>
          )}

          {step === 'privacy' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0 space-y-4">
                <SectionTitle
                  icon={ShieldCheck}
                  title="Choose privacy routing"
                  description="Use OpenShell inference.local when the selected CLI and provider can route model calls through the gateway."
                />

                <Alert className="border-primary/30 bg-primary/5">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertDescription>
                    inference.local is configured on the selected OpenShell gateway. Changing it can affect other sandboxes using that gateway, so MAP validates and shows the route instead of silently changing it.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="grid gap-2">
                    <LabelWithInfo info="When enabled, the sandbox calls https://inference.local and OpenShell routes the request to the attached provider.">
                      Privacy route
                    </LabelWithInfo>
                    <Select value={privacyRouteEnabled ? 'true' : 'false'} onValueChange={handlePrivacyRouteChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Use inference.local</SelectItem>
                        <SelectItem value="false">Direct endpoint</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <SummaryRow
                    label="Compatibility"
                    value={privacyRouteCompatible ? 'Runtime/provider can use inference.local' : 'Not compatible with this runtime/provider'}
                  />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <SummaryRow label="Runtime support" value={runtimeSupportsInferenceLocal ? 'Supported' : 'Not supported'} />
                  <SummaryRow label="Provider support" value={providerSupportsInferenceLocal ? 'Supported' : 'Not supported'} />
                  <SummaryRow label="Provider mode" value={providerMode} />
                  <SummaryRow
                    label="Current endpoint"
                    value={<code className="block truncate text-xs">{selectedEndpoint || 'Provider default'}</code>}
                  />
                </div>

                {privacyRouteEnabled && (
                  <div className="space-y-3 rounded-md border border-border/50 p-3">
                    <SectionTitle
                      icon={Network}
                      title="Gateway-scoped route confirmation"
                      description="Confirm that this gateway should route inference.local for this provider/model before deployment."
                    />
                    <div className="grid gap-3 lg:grid-cols-2">
                      <SummaryRow label="Gateway" value={`${selectedGateway.label} (${selectedGateway.id})`} />
                      <SummaryRow label="Route reported by worker" value={inferenceRoute ? JSON.stringify(inferenceRoute) : 'No route reported'} />
                      <SummaryRow label="Provider" value={providerName} />
                      <SummaryRow label="Model" value={selectedModel} />
                    </div>
                    <Button
                      type="button"
                      variant={privacyRouteAcknowledged ? 'default' : 'outline'}
                      onClick={() => setPrivacyRouteAcknowledged(true)}
                      disabled={!privacyRouteCompatible}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Confirm gateway privacy route
                    </Button>
                  </div>
                )}
              </section>

              <aside className="min-w-0 space-y-3">
                <SummaryRow label="Privacy mode" value={privacyRouteEnabled ? 'inference.local' : 'Direct endpoint'} />
                <SummaryRow label="Gateway scope" value={privacyRouteEnabled ? 'Shared gateway setting' : 'No gateway route required'} />
                <SummaryRow label="Deploy gate" value={privacyRouteEnabled && (!privacyRouteCompatible || !privacyRouteAcknowledged) ? 'Needs attention' : 'Ready for preflight'} />
                <SummaryRow
                  label="What sandbox sees"
                  value={<code className="block truncate text-xs">{privacyRouteEnabled ? 'https://inference.local' : selectedEndpoint || 'Provider default'}</code>}
                />
              </aside>
            </div>
          )}

          {step === 'files' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0 space-y-5">
                <SectionTitle
                  icon={FileText}
                  title="Package runtime assets"
                  description="Choose what env, tools, scripts, files, ports, and notes should ship with the sandbox."
                />

                <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {agentDetailLoading ? 'Scanning prompt graph...' : `${inferredGraphTools.length} graph tool(s) detected`}
                    </Badge>
                    {inferredGraphTools.map((tool) => (
                      <Badge key={tool.name} variant="secondary" className="text-[10px]">
                        {tool.name}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Tools from the selected prompt are auto-added as detected requirements only. Choose the real runtime command yourself: Python, JavaScript, shell, HTTP, MCP, or anything else your sandbox ships.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="runtime-env">Non-secret environment variables</Label>
                  <Textarea id="runtime-env" value={envText} onChange={(event) => setEnvText(event.target.value)} className={`min-h-24 resize-y ${CODE_TEXTAREA_CLASS}`} spellCheck={false} wrap="off" />
                  <div className="flex flex-wrap gap-2">
                    <PillButton onClick={() => addEnvLine('DATABASE_URL', 'postgres://user:password@postgres:5432/app')}><Database className="mr-1.5 h-3.5 w-3.5" /> Database URL</PillButton>
                    <PillButton onClick={() => addEnvLine('API_BASE_URL', 'https://api.example.com')}><Globe2 className="mr-1.5 h-3.5 w-3.5" /> API base URL</PillButton>
                    <PillButton onClick={() => addEnvLine('MAP_RUNTIME_MODE', 'production')}><Wrench className="mr-1.5 h-3.5 w-3.5" /> Runtime mode</PillButton>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">Plain values are stored with the deployment. API keys belong in secret pass-through on step 1.</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-3 rounded-md border border-border/50 p-3">
                    <SectionTitle icon={Wrench} title="Tools" description={`${tools.length} tool(s) shipped with command and implementation source`} />
                    <div className="flex flex-wrap gap-2">
                      <PillButton onClick={() => setTools((current) => appendTool(current, DEFAULT_TOOLS[0]))}>Add MAP MCP</PillButton>
                      <PillButton onClick={() => setTools((current) => appendTool(current, { name: 'HTTP tool', command: 'curl "$API_BASE_URL"', description: 'HTTP API call', sourceType: 'manual', sourcePath: 'manual command' }))}>Add HTTP command</PillButton>
                      <PillButton onClick={() => setTools((current) => appendTool(current, { name: 'Python tool', command: 'python /sandbox/map/tools/tool.py', description: 'Python tool implementation', sourceType: 'manual', sourcePath: 'tools/tool.py', needsImplementation: true }))}>Add Python tool</PillButton>
                      <PillButton onClick={() => setTools((current) => appendTool(current, { name: 'JavaScript tool', command: 'node /sandbox/map/tools/tool.js', description: 'JavaScript tool implementation', sourceType: 'manual', sourcePath: 'tools/tool.js', needsImplementation: true }))}>Add JS tool</PillButton>
                    </div>
                    <ToolTable
                      tools={tools}
                      onChange={(index, patch) => setTools((current) => current.map((tool, itemIndex) => itemIndex === index ? { ...tool, ...patch, needsImplementation: patch.command || patch.sourcePath ? false : tool.needsImplementation } : tool))}
                      onRemove={(index) => setTools((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    />
                    <AdvancedJsonButton open={advancedOpen === 'tools'} onClick={() => setAdvancedOpen(advancedOpen === 'tools' ? null : 'tools')} label="Tools JSON" />
                    {advancedOpen === 'tools' && <JsonArrayEditor value={tools} onChange={setTools} />}
                  </div>

                  <div className="space-y-3 rounded-md border border-border/50 p-3">
                    <SectionTitle icon={FileCode2} title="Scripts" description={`${scripts.length} script(s) shipped`} />
                    <div className="flex flex-wrap gap-2">
                      <PillButton onClick={() => setScripts((current) => appendScript(current, { name: 'bootstrap', path: 'scripts/bootstrap.sh', runOnStart: true, content: '. /sandbox/map/env.sh\necho runtime ready', sourceType: 'manual' }))}>Add startup script</PillButton>
                    </div>
                    <ScriptTable scripts={scripts} onRemove={(index) => setScripts((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                    <AdvancedJsonButton open={advancedOpen === 'scripts'} onClick={() => setAdvancedOpen(advancedOpen === 'scripts' ? null : 'scripts')} label="Scripts JSON" />
                    {advancedOpen === 'scripts' && <JsonArrayEditor value={scripts} onChange={setScripts} />}
                  </div>

                  <div className="space-y-3 rounded-md border border-border/50 p-3">
                    <SectionTitle icon={FileText} title="Files" description={`${files.length} file(s) shipped`} />
                    <div className="flex flex-wrap gap-2">
                      <PillButton onClick={() => setFiles((current) => appendFile(current, { path: 'config/runtime.json', content: '{ "ready": true }', sourceType: 'manual' }))}>Add config file</PillButton>
                    </div>
                    <FileTable files={files} onRemove={(index) => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                    <AdvancedJsonButton open={advancedOpen === 'files'} onClick={() => setAdvancedOpen(advancedOpen === 'files' ? null : 'files')} label="Files JSON" />
                    {advancedOpen === 'files' && <JsonArrayEditor value={files} onChange={setFiles} />}
                  </div>

                  <div className="space-y-3 rounded-md border border-border/50 p-3">
                    <SectionTitle icon={Network} title="Ports" description={`${ports.length} declared port(s)`} />
                    <div className="flex flex-wrap gap-2">
                      <PillButton onClick={() => setPorts((current) => appendPort(current, { name: 'runtime-http', port: 8787, protocol: 'http', exposure: 'sandbox', description: 'Internal runtime HTTP service' }))}>Add HTTP port</PillButton>
                    </div>
                    <PortTable ports={ports} onRemove={(index) => setPorts((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                    <AdvancedJsonButton open={advancedOpen === 'ports'} onClick={() => setAdvancedOpen(advancedOpen === 'ports' ? null : 'ports')} label="Ports JSON" />
                    {advancedOpen === 'ports' && <JsonArrayEditor value={ports} onChange={setPorts} />}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="security-notes">Security notes</Label>
                  <Textarea id="security-notes" value={securityNotesText} onChange={(event) => setSecurityNotesText(event.target.value)} className="min-h-20 text-sm leading-6" />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Runtime package preview</Label>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAdvancedOpen(advancedOpen === 'manifest' ? null : 'manifest')}>
                      {advancedOpen === 'manifest' ? 'Hide manifest' : 'Show manifest'}
                    </Button>
                  </div>
                  {advancedOpen === 'manifest' && (
                    <pre className="max-h-80 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 text-xs whitespace-pre-wrap">{packageManifest}</pre>
                  )}
                </div>
              </section>

              <aside className="min-w-0 space-y-3">
                <SummaryRow label="Prompt" value={selectedAgent?.name ?? 'No prompt selected'} />
                <SummaryRow label="Env" value={`${Object.keys(runtimePackage.env).length} plain, ${Object.keys(runtimePackage.secretEnv).length} secret mapping(s)`} />
                <SummaryRow label="Package" value={`${tools.length} tools, ${scripts.length} scripts, ${files.length} files, ${ports.length} ports`} />
                <SummaryRow label="Connections" value={`${connections.length} declared`} />
              </aside>
            </div>
          )}

          {step === 'review' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0 space-y-4">
                <SectionTitle
                  icon={PackageCheck}
                  title="Review runtime before creating sandbox"
                  description="Confirm the runtime can receive the prompt, reach its endpoints, and has the files/tools it expects."
                />

                {warnings.length > 0 ? (
                  <Alert className="border-amber-500/40 bg-amber-500/5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <AlertDescription>
                      <div className="space-y-1">
                        {warnings.map((warning) => <div key={warning}>{warning}</div>)}
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-green-500/40 bg-green-500/5">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription>No obvious runtime configuration issues detected.</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-3 rounded-md border border-border/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <SectionTitle
                      icon={ShieldCheck}
                      title="MAP preflight"
                      description="Structural prompt validation blocks deploy. Policy/provider/runtime findings appear here before the worker provisions the sandbox."
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => void runPreflight()} disabled={preflightLoading || !selectedAgentId}>
                      {preflightLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Run
                    </Button>
                  </div>
                  {preflightReport ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={preflightReport.ok ? 'default' : 'destructive'}>
                          {preflightReport.ok ? 'Passed' : 'Blocked'}
                        </Badge>
                        <Badge variant="outline">{preflightReport.blockingIssues} blocking</Badge>
                        <Badge variant="outline">{preflightReport.warnings} warning(s)</Badge>
                      </div>
                      <div className="grid gap-2 lg:grid-cols-2">
                        {preflightReport.checks.map((check) => (
                          <div key={check.id} className="rounded-md border border-border/50 bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold">{check.label}</div>
                              <Badge variant={check.status === 'fail' ? 'destructive' : 'outline'} className="text-[10px]">
                                {check.status}
                              </Badge>
                            </div>
                            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.message}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {preflightLoading ? 'Checking runtime manifest...' : 'Run preflight to validate the deployment gate.'}
                    </div>
                  )}

                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <SummaryRow label="Runtime" value={`${RUNTIME_PRESETS.find((preset) => preset.kind === runtimeKind)?.label ?? runtimeKind} using ${LLM_PRESETS[llmPreset].label}`} />
                  <SummaryRow label="Gateway" value={`${selectedGateway.label} · ${selectedGateway.endpoint}`} />
                  <SummaryRow label="Image / mode" value={`${sandboxImage || 'base'} / ${executionMode}`} />
                  <SummaryRow label="Provider" value={`${providerName} (${effectiveProviderMode})`} />
                  <SummaryRow label="Prompt" value={selectedAgent?.name ?? 'No prompt selected'} />
                  <SummaryRow label="Policy" value={policyMode} />
                  <SummaryRow label="Connections" value={connections.map((connection) => connection.name).join(', ') || 'None'} />
                  <SummaryRow label="Tools" value={tools.map((tool) => tool.name).join(', ') || 'None'} />
                  <SummaryRow label="Files shipped" value={files.map((file) => file.path).join(', ') || 'None'} />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Runtime package manifest</Label>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAdvancedOpen(advancedOpen === 'manifest' ? null : 'manifest')}>
                      {advancedOpen === 'manifest' ? 'Hide manifest' : 'Show manifest'}
                    </Button>
                  </div>
                  {advancedOpen === 'manifest' && (
                    <pre className="max-h-80 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 text-xs whitespace-pre-wrap">{packageManifest}</pre>
                  )}
                </div>
              </section>

              <aside className="min-w-0 space-y-3">
                <SummaryRow
                  label="Files in sandbox"
                  value={
                    <div className="space-y-1 text-xs font-mono">
                      <div>/sandbox/map/prompt.md</div>
                      <div>/sandbox/map/input.txt</div>
                      <div>/sandbox/map/env.sh</div>
                      <div>/sandbox/map/runtime-package.json</div>
                      {files.slice(0, 4).map((file) => <div key={file.path}>/sandbox/map/{file.path}</div>)}
                    </div>
                  }
                />
                <SummaryRow label="Create action" value="Worker creates OpenShell sandbox, uploads package, then marks deployment ready." />
              </aside>
            </div>
          )}
        </div>

        <DialogFooter className="items-center border-t border-border/50 px-6 py-4">
          <div className="mr-auto text-xs text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}: {activeStep.label}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={goBack} disabled={stepIndex === 0}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          {step !== 'review' ? (
            <Button onClick={goNext}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={saving || preflightLoading || !preflightReport?.ok || !selectedAgentId || !runtimeEnabled || (privacyRouteEnabled && (!privacyRouteCompatible || !privacyRouteAcknowledged))}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Create Agent Runtime
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function appendTool(current: ToolDraft[], next: ToolDraft) {
  if (current.some((tool) => tool.name === next.name)) return current
  return [...current, next]
}

function appendScript(current: ScriptDraft[], next: ScriptDraft) {
  if (current.some((script) => script.path === next.path)) return current
  return [...current, next]
}

function appendFile(current: FileDraft[], next: FileDraft) {
  if (current.some((file) => file.path === next.path)) return current
  return [...current, next]
}

function appendPort(current: PortDraft[], next: PortDraft) {
  if (current.some((port) => port.port === next.port && port.protocol === next.protocol)) return current
  return [...current, next]
}

function sourceLabel(value?: string) {
  if (!value) return 'manual'
  if (value === 'graph') return 'graph node'
  if (value === 'preset') return 'preset'
  return value
}

function EmptyTable({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-border/60 p-4 text-sm text-muted-foreground">{message}</div>
}

function ToolTable({
  tools,
  onChange,
  onRemove,
}: {
  tools: ToolDraft[]
  onChange: (index: number, patch: Partial<ToolDraft>) => void
  onRemove: (index: number) => void
}) {
  if (tools.length === 0) return <EmptyTable message="No tools packaged" />
  return (
    <div className="overflow-x-auto rounded-md border border-border/50">
      <table className="w-full min-w-[920px] text-left text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Tool</th>
            <th className="px-3 py-2">Runtime command</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Implementation/script/file</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {tools.map((tool, index) => {
            const missingCommand = tool.sourceType === 'graph' && !tool.command.trim()
            return (
              <tr key={`${tool.name}-${index}`} className="border-t border-border/50 align-top">
                <td className="px-3 py-2">
                  <Input
                    value={tool.name}
                    onChange={(event) => onChange(index, { name: event.target.value })}
                    className="h-8 min-w-40 text-xs"
                    placeholder="Tool name"
                  />
                  {tool.description && (
                    <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{tool.description}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={tool.command}
                    onChange={(event) => onChange(index, { command: event.target.value })}
                    className="h-8 min-w-72 font-mono text-xs"
                    placeholder="python /sandbox/map/tools/order_lookup.py"
                  />
                </td>
                <td className="px-3 py-2">
                  <div>{sourceLabel(tool.sourceType)}</div>
                  {tool.sourceNodeId && <div className="mt-1 font-mono text-[11px] text-muted-foreground">{tool.sourceNodeId}</div>}
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={tool.sourcePath ?? ''}
                    onChange={(event) => onChange(index, { sourcePath: event.target.value })}
                    className="h-8 min-w-56 font-mono text-xs"
                    placeholder="tools/order_lookup.py, external API, MCP"
                  />
                </td>
                <td className="px-3 py-2">
                  {missingCommand ? (
                    <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-300">configure command</Badge>
                  ) : tool.needsImplementation ? (
                    <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-300">needs implementation</Badge>
                  ) : (
                    <Badge variant="outline" className="border-green-500/40 text-[10px] text-green-600 dark:text-green-300">ready</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onRemove(index)}>Remove</Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ScriptTable({ scripts, onRemove }: { scripts: ScriptDraft[]; onRemove: (index: number) => void }) {
  if (scripts.length === 0) return <EmptyTable message="No scripts packaged" />
  return (
    <div className="overflow-x-auto rounded-md border border-border/50">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Script</th>
            <th className="px-3 py-2">Path</th>
            <th className="px-3 py-2">Responsible for</th>
            <th className="px-3 py-2">Run on start</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {scripts.map((script, index) => (
            <tr key={`${script.path}-${index}`} className="border-t border-border/50">
              <td className="px-3 py-2 font-medium">{script.name}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">/sandbox/map/{script.path}</td>
              <td className="px-3 py-2">{script.sourceTool ?? 'runtime setup'}</td>
              <td className="px-3 py-2">{script.runOnStart ? 'yes' : 'no'}</td>
              <td className="px-3 py-2">{sourceLabel(script.sourceType)}</td>
              <td className="px-3 py-2 text-right">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onRemove(index)}>Remove</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FileTable({ files, onRemove }: { files: FileDraft[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return <EmptyTable message="No files packaged" />
  return (
    <div className="overflow-x-auto rounded-md border border-border/50">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">File</th>
            <th className="px-3 py-2">Sandbox path</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {files.map((file, index) => (
            <tr key={`${file.path}-${index}`} className="border-t border-border/50">
              <td className="px-3 py-2 font-medium">{file.path.split('/').pop()}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">/sandbox/map/{file.path}</td>
              <td className="px-3 py-2">{sourceLabel(file.sourceType)}</td>
              <td className="px-3 py-2 text-right">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onRemove(index)}>Remove</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PortTable({ ports, onRemove }: { ports: PortDraft[]; onRemove: (index: number) => void }) {
  if (ports.length === 0) return <EmptyTable message="No ports declared" />
  return (
    <div className="overflow-x-auto rounded-md border border-border/50">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Port</th>
            <th className="px-3 py-2">Protocol</th>
            <th className="px-3 py-2">Exposure</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {ports.map((port, index) => (
            <tr key={`${port.protocol}-${port.port}-${index}`} className="border-t border-border/50">
              <td className="px-3 py-2 font-medium">{port.name} :{port.port}</td>
              <td className="px-3 py-2">{port.protocol}</td>
              <td className="px-3 py-2">{port.exposure}</td>
              <td className="px-3 py-2 text-muted-foreground">{port.description ?? '-'}</td>
              <td className="px-3 py-2 text-right">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onRemove(index)}>Remove</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AdvancedJsonButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={onClick}>
      {open ? `Hide ${label}` : `Edit ${label}`}
    </Button>
  )
}

function JsonArrayEditor<T>({ value, onChange }: { value: T[]; onChange: (value: T[]) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2))

  useEffect(() => {
    setText(JSON.stringify(value, null, 2))
  }, [value])

  function update(nextText: string) {
    setText(nextText)
    try {
      const parsed = JSON.parse(nextText || '[]')
      if (Array.isArray(parsed)) onChange(parsed)
    } catch {
      // Keep editing invalid JSON without destroying the last valid value.
    }
  }

  return (
    <Textarea
      value={text}
      onChange={(event) => update(event.target.value)}
      className={`min-h-40 resize-y ${CODE_TEXTAREA_CLASS}`}
      spellCheck={false}
      wrap="off"
    />
  )
}

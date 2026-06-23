import {
  GEMINI_CHAT_RESPONSE_RULES,
  type ProviderMode,
  type ProviderRole,
  type ProviderTemplate,
  type RuntimeGatewayProfile,
  type RuntimeId,
  type RuntimeTemplate,
} from './types'

export const DEFAULT_SANDBOX_WORKDIR = '/sandbox'

export const GATEWAY_CATALOG: RuntimeGatewayProfile[] = [
  {
    id: 'map',
    label: 'Local MAP gateway',
    endpoint: process.env.OPENSHELL_GATEWAY_URL || 'http://openshell-gateway:8080',
    mode: 'local-docker',
    description: 'Default local OpenShell gateway managed by Docker Compose.',
    defaultForEnvironment: 'development',
  },
  {
    id: 'remote-gpu',
    label: 'Remote GPU gateway',
    endpoint: 'https://openshell-gateway.example.com',
    mode: 'remote-docker',
    description: 'Remote gateway on a GPU host or shared workstation.',
    defaultForEnvironment: 'production',
  },
  {
    id: 'kubernetes',
    label: 'Kubernetes gateway',
    endpoint: 'https://openshell-gateway.cluster.example.com',
    mode: 'kubernetes',
    description: 'Gateway backed by a Kubernetes sandbox compute driver.',
    defaultForEnvironment: 'production',
  },
]

export const RUNTIME_CATALOG: RuntimeTemplate[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    description: 'Anthropic Claude Code inside the OpenShell base image.',
    image: 'base',
    recommendedImages: [
      { value: 'base', label: 'base', description: 'Default OpenShell image with Claude Code.', default: true },
      { value: 'custom', label: 'Custom image', description: 'Pinned image that includes Claude Code and team tools.' },
    ],
    defaultCommand: 'claude -p "$(cat {input})" --append-system-prompt "$(cat {prompt})"',
    binary: 'claude',
    providerMode: 'providers-v2',
    defaultProviderIds: ['anthropic'],
    compatibleProviderIds: ['anthropic'],
    requiredBinaries: ['/usr/local/bin/claude', '/usr/bin/claude'],
    requiredEnv: ['ANTHROPIC_API_KEY'],
    supportsInferenceLocal: true,
    supportsInteractive: true,
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    description: 'OpenAI Codex CLI inside the OpenShell base image.',
    image: 'base',
    recommendedImages: [
      { value: 'base', label: 'base', description: 'Default OpenShell image with Codex CLI.', default: true },
      { value: 'custom', label: 'Custom image', description: 'Pinned image that includes Codex CLI and team tools.' },
    ],
    defaultCommand: 'codex exec "$(printf \'%s\\n\\nUser input:\\n%s\' "$(cat {prompt})" "$(cat {input})")"',
    binary: 'codex',
    providerMode: 'providers-v2',
    defaultProviderIds: ['openai-compatible'],
    compatibleProviderIds: ['openai-compatible', 'azure-openai', 'azure-ai-foundry', 'custom-api'],
    requiredBinaries: ['/usr/local/bin/codex', '/usr/bin/codex'],
    requiredEnv: ['OPENAI_API_KEY'],
    supportsInferenceLocal: false,
    supportsInteractive: true,
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    description: 'OpenCode agent CLI inside the OpenShell base image.',
    image: 'base',
    recommendedImages: [
      { value: 'base', label: 'base', description: 'Default OpenShell image with OpenCode.', default: true },
      { value: 'custom', label: 'Custom image', description: 'Pinned image that includes OpenCode and team tools.' },
    ],
    defaultCommand: 'opencode run --prompt-file {prompt} "$(cat {input})"',
    binary: 'opencode',
    providerMode: 'providers-v2',
    defaultProviderIds: ['openai-compatible'],
    compatibleProviderIds: ['openai-compatible', 'custom-api'],
    requiredBinaries: ['/usr/local/bin/opencode', '/usr/bin/opencode'],
    requiredEnv: ['OPENAI_API_KEY'],
    supportsInferenceLocal: true,
    supportsInteractive: true,
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    description: 'Google Gemini CLI using the OpenShell community gemini image.',
    image: 'gemini',
    recommendedImages: [
      { value: 'gemini', label: 'gemini', description: 'OpenShell community image with Gemini CLI.', default: true },
      { value: 'custom', label: 'Custom image', description: 'Pinned image with a team-approved Gemini CLI version.' },
    ],
    defaultCommand: `gemini -p "$(printf '%s\\n\\n${GEMINI_CHAT_RESPONSE_RULES}\\n\\nUser input:\\n%s' "$(cat {prompt})" "$(cat {input})")"`,
    binary: 'gemini',
    providerMode: 'providers-v2',
    defaultProviderIds: ['google-ai-studio'],
    compatibleProviderIds: ['google-ai-studio', 'google-vertex-ai'],
    requiredBinaries: ['/usr/local/bin/gemini', '/usr/bin/gemini'],
    requiredEnv: ['GEMINI_API_KEY'],
    supportsInferenceLocal: false,
    supportsInteractive: true,
  },
  {
    id: 'custom',
    label: 'Custom command',
    description: 'Bring your own command, image, provider set, and policy.',
    image: 'base',
    recommendedImages: [
      { value: 'base', label: 'base', description: 'Default OpenShell image.', default: true },
      { value: 'custom', label: 'Custom image', description: 'Any image available to the selected OpenShell gateway.' },
    ],
    defaultCommand: 'cat {prompt} {input}',
    binary: 'sh',
    providerMode: 'direct',
    defaultProviderIds: [],
    compatibleProviderIds: ['openai-compatible', 'anthropic', 'azure-openai', 'azure-ai-foundry', 'google-ai-studio', 'google-vertex-ai', 'nvidia', 'local-endpoint', 'custom-api'],
    requiredBinaries: [],
    requiredEnv: [],
    supportsInferenceLocal: false,
    supportsInteractive: false,
  },
]

export const PROVIDER_CATALOG: ProviderTemplate[] = [
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    description: 'OpenAI, LiteLLM, OpenRouter, vLLM, LM Studio, or any compatible /v1 endpoint.',
    type: 'generic',
    role: 'llm',
    mode: 'providers-v2',
    credentialKeys: ['OPENAI_API_KEY'],
    env: {
      LLM_PROVIDER: 'openai-compatible',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      OPENAI_MODEL: 'gpt-5.4-mini',
    },
    compatibleRuntimeIds: ['codex', 'opencode', 'custom'],
    defaultModels: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.4-codex', 'custom-model'],
    endpointEnvKey: 'OPENAI_BASE_URL',
    modelEnvKey: 'OPENAI_MODEL',
    apiKeyEnvKey: 'OPENAI_API_KEY',
    config: {},
    endpoints: [
      { name: 'OpenAI-compatible API', target: 'https://api.openai.com', direction: 'outbound', description: 'LLM API endpoint' },
    ],
    supportsInferenceLocal: true,
    supportsRefresh: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Anthropic API or Claude Code provider profile.',
    type: 'claude-code',
    role: 'llm',
    mode: 'providers-v2',
    credentialKeys: ['ANTHROPIC_API_KEY'],
    env: {
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
    },
    compatibleRuntimeIds: ['claude-code', 'custom'],
    defaultModels: ['claude-sonnet-4-6', 'claude-opus-4-5', 'custom-model'],
    endpointEnvKey: 'ANTHROPIC_BASE_URL',
    modelEnvKey: 'ANTHROPIC_MODEL',
    apiKeyEnvKey: 'ANTHROPIC_API_KEY',
    config: {},
    endpoints: [
      { name: 'Anthropic API', target: 'https://api.anthropic.com', direction: 'outbound', description: 'Anthropic Messages API' },
    ],
    supportsInferenceLocal: true,
    supportsRefresh: false,
  },
  {
    id: 'azure-openai',
    label: 'Azure OpenAI',
    description: 'Azure OpenAI deployment endpoint.',
    type: 'generic',
    role: 'llm',
    mode: 'providers-v2',
    credentialKeys: ['AZURE_OPENAI_API_KEY'],
    env: {
      LLM_PROVIDER: 'azure-openai',
      AZURE_OPENAI_ENDPOINT: 'https://your-resource.openai.azure.com',
      AZURE_OPENAI_API_VERSION: '2025-04-01-preview',
      AZURE_OPENAI_DEPLOYMENT: 'your-deployment',
      OPENAI_API_TYPE: 'azure',
    },
    compatibleRuntimeIds: ['codex', 'custom'],
    defaultModels: ['your-deployment', 'custom-model'],
    endpointEnvKey: 'AZURE_OPENAI_ENDPOINT',
    modelEnvKey: 'AZURE_OPENAI_DEPLOYMENT',
    apiKeyEnvKey: 'AZURE_OPENAI_API_KEY',
    config: {},
    endpoints: [
      { name: 'Azure OpenAI', target: 'https://your-resource.openai.azure.com', direction: 'outbound', description: 'Azure OpenAI resource endpoint' },
    ],
    supportsInferenceLocal: false,
    supportsRefresh: false,
  },
  {
    id: 'azure-ai-foundry',
    label: 'Azure AI Foundry',
    description: 'Azure AI Foundry OpenAI-compatible endpoint.',
    type: 'generic',
    role: 'llm',
    mode: 'providers-v2',
    credentialKeys: ['OPENAI_API_KEY'],
    env: {
      LLM_PROVIDER: 'openai-compatible',
      OPENAI_BASE_URL: 'https://your-foundry-openai-compatible-endpoint',
      OPENAI_MODEL: 'your-foundry-model',
    },
    compatibleRuntimeIds: ['codex', 'custom'],
    defaultModels: ['your-foundry-model', 'custom-model'],
    endpointEnvKey: 'OPENAI_BASE_URL',
    modelEnvKey: 'OPENAI_MODEL',
    apiKeyEnvKey: 'OPENAI_API_KEY',
    config: {},
    endpoints: [
      { name: 'Azure AI Foundry', target: 'https://your-foundry-openai-compatible-endpoint', direction: 'outbound', description: 'Foundry model endpoint' },
    ],
    supportsInferenceLocal: false,
    supportsRefresh: false,
  },
  {
    id: 'google-ai-studio',
    label: 'Google AI Studio',
    description: 'Gemini API key for Gemini CLI and Google GenAI SDKs.',
    type: 'generic',
    role: 'llm',
    mode: 'providers-v2',
    credentialKeys: ['GEMINI_API_KEY'],
    env: {
      LLM_PROVIDER: 'google-ai-studio',
      GEMINI_MODEL: 'gemini-3-flash-preview',
    },
    compatibleRuntimeIds: ['gemini-cli', 'custom'],
    defaultModels: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'custom-model'],
    modelEnvKey: 'GEMINI_MODEL',
    apiKeyEnvKey: 'GEMINI_API_KEY',
    config: {},
    endpoints: [
      { name: 'Gemini API', target: 'https://generativelanguage.googleapis.com', direction: 'outbound', description: 'Google Gemini API' },
    ],
    supportsInferenceLocal: false,
    supportsRefresh: false,
  },
  {
    id: 'google-vertex-ai',
    label: 'Google Vertex AI',
    description: 'Gateway-managed Vertex AI provider for Gemini, Claude, and third-party models.',
    type: 'google-vertex-ai',
    role: 'llm',
    mode: 'inference-local',
    credentialKeys: ['GOOGLE_SERVICE_ACCOUNT_KEY'],
    env: {
      LLM_PROVIDER: 'google-vertex-ai',
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
      GOOGLE_CLOUD_PROJECT: 'your-gcp-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GEMINI_MODEL: 'gemini-3-flash-preview',
    },
    compatibleRuntimeIds: ['gemini-cli', 'custom'],
    defaultModels: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'custom-model'],
    endpointEnvKey: 'OPENAI_BASE_URL',
    modelEnvKey: 'GEMINI_MODEL',
    apiKeyEnvKey: 'GOOGLE_SERVICE_ACCOUNT_KEY',
    config: {
      VERTEX_AI_PROJECT_ID: 'your-gcp-project',
      VERTEX_AI_REGION: 'us-central1',
    },
    endpoints: [
      { name: 'Vertex AI', target: 'https://aiplatform.googleapis.com', direction: 'outbound', description: 'Vertex AI inference endpoint' },
    ],
    supportsInferenceLocal: true,
    supportsRefresh: true,
    profileRequired: true,
  },
  {
    id: 'nvidia',
    label: 'NVIDIA API Catalog',
    description: 'NVIDIA inference provider for inference.local routing.',
    type: 'nvidia',
    role: 'llm',
    mode: 'inference-local',
    credentialKeys: ['NVIDIA_API_KEY'],
    env: {
      LLM_PROVIDER: 'nvidia',
      OPENAI_BASE_URL: 'https://inference.local/v1',
      OPENAI_MODEL: 'nvidia/nemotron-3-nano-30b-a3b',
    },
    compatibleRuntimeIds: ['opencode', 'custom'],
    defaultModels: ['nvidia/nemotron-3-nano-30b-a3b', 'custom-model'],
    endpointEnvKey: 'OPENAI_BASE_URL',
    modelEnvKey: 'OPENAI_MODEL',
    apiKeyEnvKey: 'NVIDIA_API_KEY',
    config: {},
    endpoints: [
      { name: 'NVIDIA API', target: 'https://integrate.api.nvidia.com', direction: 'outbound', description: 'NVIDIA model endpoint' },
    ],
    supportsInferenceLocal: true,
    supportsRefresh: false,
    profileRequired: true,
  },
  {
    id: 'local-endpoint',
    label: 'Local endpoint',
    description: 'Ollama, LM Studio, vLLM, or another gateway-reachable local endpoint.',
    type: 'generic',
    role: 'llm',
    mode: 'direct',
    credentialKeys: ['OPENAI_API_KEY'],
    env: {
      LLM_PROVIDER: 'openai-compatible',
      OPENAI_BASE_URL: 'http://host.openshell.internal:11434/v1',
      OPENAI_MODEL: 'local-model',
    },
    compatibleRuntimeIds: ['opencode', 'custom'],
    defaultModels: ['local-model', 'custom-model'],
    endpointEnvKey: 'OPENAI_BASE_URL',
    modelEnvKey: 'OPENAI_MODEL',
    apiKeyEnvKey: 'OPENAI_API_KEY',
    config: {},
    endpoints: [
      { name: 'Local model endpoint', target: 'http://host.openshell.internal:11434', direction: 'outbound', description: 'Gateway-reachable local inference endpoint' },
    ],
    supportsInferenceLocal: true,
    supportsRefresh: false,
  },
  {
    id: 'custom-api',
    label: 'Custom API',
    description: 'Custom provider profile or generic API credential.',
    type: 'generic',
    role: 'custom',
    mode: 'providers-v2',
    credentialKeys: ['API_KEY'],
    env: {},
    compatibleRuntimeIds: ['codex', 'opencode', 'custom'],
    defaultModels: ['your-model', 'custom-model'],
    endpointEnvKey: 'OPENAI_BASE_URL',
    modelEnvKey: 'OPENAI_MODEL',
    apiKeyEnvKey: 'API_KEY',
    config: {},
    endpoints: [
      { name: 'Custom API', target: 'https://api.example.com', direction: 'outbound', description: 'Replace with the real target' },
    ],
    supportsInferenceLocal: false,
    supportsRefresh: false,
  },
]

export function getRuntimeTemplate(id: unknown): RuntimeTemplate {
  return RUNTIME_CATALOG.find((runtime) => runtime.id === id) ?? RUNTIME_CATALOG.find((runtime) => runtime.id === 'custom')!
}

export function getProviderTemplate(id: unknown): ProviderTemplate {
  return PROVIDER_CATALOG.find((provider) => provider.id === id) ?? PROVIDER_CATALOG.find((provider) => provider.id === 'custom-api')!
}

export function isProviderCompatibleWithRuntime(providerId: unknown, runtimeId: unknown): boolean {
  const runtime = getRuntimeTemplate(runtimeId)
  const provider = getProviderTemplate(providerId)
  if (runtime.id === 'custom') return true
  if (runtime.compatibleProviderIds?.includes(provider.id)) return true
  if (provider.compatibleRuntimeIds?.includes(runtime.id)) return true
  return false
}

export function compatibleProvidersForRuntime(runtimeId: unknown, includeAdvanced = false): ProviderTemplate[] {
  const runtime = getRuntimeTemplate(runtimeId)
  return PROVIDER_CATALOG.filter((provider) => {
    if (!isProviderCompatibleWithRuntime(provider.id, runtime.id)) return false
    if (!includeAdvanced && provider.simpleSetup === false) return false
    return true
  })
}

export function defaultProviderForRuntime(runtimeId: unknown): ProviderTemplate {
  const runtime = getRuntimeTemplate(runtimeId)
  const defaultId = runtime.defaultProviderIds[0]
  return compatibleProvidersForRuntime(runtime.id, true).find((provider) => provider.id === defaultId)
    ?? compatibleProvidersForRuntime(runtime.id, true)[0]
    ?? getProviderTemplate('custom-api')
}

export function getGatewayTemplate(id: unknown): RuntimeGatewayProfile {
  return GATEWAY_CATALOG.find((gateway) => gateway.id === id) ?? GATEWAY_CATALOG[0]
}

export function runtimeIdFromKind(value: unknown): RuntimeId {
  const id = String(value || 'custom')
  return RUNTIME_CATALOG.some((runtime) => runtime.id === id) ? id as RuntimeId : 'custom'
}

export function providerModeFromValue(value: unknown, fallback: ProviderMode = 'providers-v2'): ProviderMode {
  return ['providers-v2', 'inference-local', 'legacy-env', 'direct'].includes(String(value))
    ? String(value) as ProviderMode
    : fallback
}

export function providerRoleFromValue(value: unknown, fallback: ProviderRole = 'llm'): ProviderRole {
  return ['llm', 'tool', 'mcp', 'source-control', 'data', 'custom'].includes(String(value))
    ? String(value) as ProviderRole
    : fallback
}

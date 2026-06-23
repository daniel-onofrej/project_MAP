import { describe, expect, it } from 'vitest'
import { buildPreflightReport, buildRuntimeManifest } from '../lib/deployments/manifest'
import { defaultProviderForRuntime, getProviderTemplate, isProviderCompatibleWithRuntime } from '../lib/deployments/catalog'
import type { AgentConfig } from '../lib/types'

const agent: AgentConfig = {
  id: 'agent-1',
  name: 'Refund Agent',
  description: 'Test agent',
  nodes: [],
  connections: [],
  version: '1',
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
}

const networkPolicy = `version: 1
network_policies:
  llm:
    name: llm
    endpoints:
      - host: api.openai.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
    binaries:
      - path: /usr/local/bin/codex
`

describe('OpenShell setup flow catalog and manifest', () => {
  it('keeps provider choices compatible with CLI runtime defaults', () => {
    expect(defaultProviderForRuntime('codex').id).toBe('openai-compatible')
    expect(defaultProviderForRuntime('claude-code').id).toBe('anthropic')
    expect(defaultProviderForRuntime('gemini-cli').id).toBe('google-ai-studio')

    expect(isProviderCompatibleWithRuntime('anthropic', 'codex')).toBe(false)
    expect(isProviderCompatibleWithRuntime('google-ai-studio', 'codex')).toBe(false)
    expect(isProviderCompatibleWithRuntime('google-ai-studio', 'gemini-cli')).toBe(true)
  })

  it('uses catalog model defaults for OpenAI-compatible runtimes', () => {
    expect(getProviderTemplate('openai-compatible').env.OPENAI_MODEL).toBe('gpt-5.4-mini')
    expect(getProviderTemplate('openai-compatible').defaultModels?.[0]).toBe('gpt-5.4-mini')
  })

  it('generates policy from providers and package connections by default', () => {
    const { manifest } = buildRuntimeManifest({
      deploymentId: 'dep-generated',
      sandboxName: 'map-dep-generated',
      agent,
      runtimeId: 'codex',
      runtimeCommand: 'codex exec "$(cat {prompt}) $(cat {input})"',
      providers: [{ templateId: 'openai-compatible', name: 'map-openai' }],
      runtimePackage: {
        connections: [
          { name: 'MAP MCP', target: 'http://mcp-server:3100/mcp', direction: 'outbound' },
        ],
      },
      providerMode: 'providers-v2',
      policyMode: 'generated',
    })

    expect(manifest.policy.mode).toBe('generated')
    expect(manifest.policy.yaml).toContain('host: api.openai.com')
    expect(manifest.policy.yaml).toContain('host: mcp-server')
  })

  it('blocks incompatible runtime/provider combinations in preflight', () => {
    const { manifest } = buildRuntimeManifest({
      deploymentId: 'dep-1',
      sandboxName: 'map-dep-1',
      agent,
      runtimeId: 'codex',
      runtimeCommand: 'codex exec "$(cat {prompt}) $(cat {input})"',
      providers: [{ templateId: 'anthropic', name: 'map-anthropic' }],
      providerMode: 'providers-v2',
      policyYaml: networkPolicy,
    })

    const report = buildPreflightReport(agent, manifest)
    expect(report.ok).toBe(false)
    expect(report.checks.find((check) => check.id === 'runtime-provider-compatibility')?.status).toBe('fail')
  })

  it('does not apply LLM runtime compatibility to internal MCP providers', () => {
    const { manifest } = buildRuntimeManifest({
      deploymentId: 'dep-gemini-mcp',
      sandboxName: 'map-dep-gemini-mcp',
      agent,
      runtimeId: 'gemini-cli',
      runtimeCommand: 'gemini -p "$(cat {prompt}) $(cat {input})"',
      providers: [
        { templateId: 'google-ai-studio', name: 'map-gemini' },
        {
          id: 'map-mcp',
          templateId: 'map-mcp',
          name: 'map-mcp-dep-gemini-mcp',
          type: 'generic',
          role: 'mcp',
          mode: 'providers-v2',
          credentialKeys: ['MCP_AUTH_TOKEN'],
          sourceEnv: { MCP_AUTH_TOKEN: 'MCP_AUTH_TOKEN' },
          attach: true,
          useForInference: false,
        },
      ],
      providerMode: 'providers-v2',
      policyMode: 'generated',
    })

    const report = buildPreflightReport(agent, manifest, {
      credentialSources: {
        GEMINI_API_KEY: { present: true, usedBy: ['Google AI Studio'] },
        MCP_AUTH_TOKEN: { present: true, usedBy: ['MAP MCP'] },
      },
    })

    expect(report.ok).toBe(true)
    expect(report.checks.find((check) => check.id === 'runtime-provider-compatibility')?.status).toBe('pass')
  })

  it('records inference.local privacy intent in the manifest', () => {
    const { manifest } = buildRuntimeManifest({
      deploymentId: 'dep-2',
      sandboxName: 'map-dep-2',
      agent,
      runtimeId: 'claude-code',
      runtimeCommand: 'claude -p "$(cat {input})" --append-system-prompt "$(cat {prompt})"',
      providers: [{ templateId: 'anthropic', name: 'map-anthropic', useForInference: true }],
      providerMode: 'inference-local',
      policyYaml: networkPolicy,
    })

    expect(manifest.privacy).toMatchObject({
      mode: 'inference-local',
      required: true,
      gatewayScoped: true,
      providerName: 'map-anthropic',
    })
    expect(buildPreflightReport(agent, manifest).checks.find((check) => check.id === 'privacy-inference-local')?.status).toBe('pass')
  })

  it('blocks missing worker credential env vars in preflight', () => {
    const { manifest } = buildRuntimeManifest({
      deploymentId: 'dep-missing-env',
      sandboxName: 'map-dep-missing-env',
      agent,
      runtimeId: 'codex',
      runtimeCommand: 'codex exec "$(cat {prompt}) $(cat {input})"',
      providers: [{ templateId: 'openai-compatible', name: 'map-openai' }],
      providerMode: 'providers-v2',
      policyMode: 'generated',
    })

    const report = buildPreflightReport(agent, manifest, {
      credentialSources: {
        OPENAI_API_KEY: { present: false, usedBy: ['OpenAI-compatible'] },
      },
    })

    expect(report.ok).toBe(false)
    expect(report.checks.find((check) => check.id === 'worker-credential-env')?.status).toBe('fail')
  })

  it('accepts one-time pasted provider credentials in preflight', () => {
    const { manifest } = buildRuntimeManifest({
      deploymentId: 'dep-pasted-key',
      sandboxName: 'map-dep-pasted-key',
      agent,
      runtimeId: 'codex',
      runtimeCommand: 'codex exec "$(cat {prompt}) $(cat {input})"',
      providers: [{ templateId: 'openai-compatible', name: 'map-openai' }],
      providerMode: 'providers-v2',
      policyMode: 'generated',
    })

    const report = buildPreflightReport(agent, manifest, {
      credentialSources: {
        OPENAI_API_KEY: { present: false, usedBy: ['OpenAI-compatible'] },
      },
      providerCredentialValues: {
        'map-openai': { OPENAI_API_KEY: 'sk-test' },
      },
    })

    expect(report.ok).toBe(true)
    expect(report.checks.find((check) => check.id === 'worker-credential-env')?.status).toBe('pass')
  })

  it('blocks placeholder endpoint or model values in preflight', () => {
    const { manifest } = buildRuntimeManifest({
      deploymentId: 'dep-placeholder',
      sandboxName: 'map-dep-placeholder',
      agent,
      runtimeId: 'custom',
      runtimeCommand: 'cat {prompt} {input}',
      providers: [{
        templateId: 'custom-api',
        name: 'map-custom',
        env: {
          OPENAI_BASE_URL: 'https://your-openai-compatible-endpoint/v1',
          OPENAI_MODEL: 'your-model',
        },
        sourceEnv: { API_KEY: 'API_KEY' },
      }],
      providerMode: 'providers-v2',
      policyMode: 'generated',
    })

    const report = buildPreflightReport(agent, manifest)
    expect(report.ok).toBe(false)
    expect(report.checks.find((check) => check.id === 'placeholder-values')?.status).toBe('fail')
  })

  it('blocks unimplemented packaged tools in preflight', () => {
    const { manifest } = buildRuntimeManifest({
      deploymentId: 'dep-tool',
      sandboxName: 'map-dep-tool',
      agent,
      runtimeId: 'codex',
      runtimeCommand: 'codex exec "$(cat {prompt}) $(cat {input})"',
      providers: [{ templateId: 'openai-compatible', name: 'map-openai' }],
      runtimePackage: {
        tools: [{ name: 'OrderLookup', command: 'python /sandbox/map/tools/orderlookup.py', needsImplementation: true }],
      },
      providerMode: 'providers-v2',
      policyMode: 'generated',
    })

    const report = buildPreflightReport(agent, manifest)
    expect(report.ok).toBe(false)
    expect(report.checks.find((check) => check.id === 'runtime-tools-ready')?.status).toBe('fail')
  })

  it('inherits graph-owned runtime assets into the pinned manifest package', () => {
    const graphAgent: AgentConfig = {
      ...agent,
      runtimePackage: {
        env: { GRAPH_ENV: 'yes' },
        secretEnv: {},
        tools: [{ name: 'OrderLookup', command: 'python /sandbox/map/tools/order_lookup.py', sourceType: 'graph', needsImplementation: false }],
        scripts: [{ name: 'bootstrap', path: 'scripts/bootstrap.sh', content: 'echo graph ready', runOnStart: true, sourceType: 'graph' }],
        files: [{ path: 'tools/order_lookup.py', content: 'print("ok")', sourceType: 'graph' }],
        ports: [],
        connections: [{ name: 'Orders API', target: 'https://orders.example.com', direction: 'outbound' }],
        securityNotes: ['Graph-owned package'],
      },
    }

    const { manifest } = buildRuntimeManifest({
      deploymentId: 'dep-graph-assets',
      sandboxName: 'map-dep-graph-assets',
      agent: graphAgent,
      runtimeId: 'codex',
      runtimeCommand: 'codex exec "$(cat {prompt}) $(cat {input})"',
      providers: [],
      runtimePackage: {
        env: { DEPLOY_ENV: 'yes' },
      },
      providerMode: 'providers-v2',
      policyMode: 'generated',
    })

    expect(manifest.package.env).toMatchObject({ GRAPH_ENV: 'yes', DEPLOY_ENV: 'yes' })
    expect(manifest.package.tools).toEqual([expect.objectContaining({ name: 'OrderLookup', sourceType: 'graph' })])
    expect(manifest.package.scripts).toEqual([expect.objectContaining({ path: 'scripts/bootstrap.sh', runOnStart: true })])
    expect(manifest.package.files).toEqual([expect.objectContaining({ path: 'tools/order_lookup.py' })])
    expect(manifest.package.connections).toEqual(expect.arrayContaining([expect.objectContaining({ target: 'https://orders.example.com' })]))
    expect(manifest.security.notes).toContain('Graph-owned package')
  })
})

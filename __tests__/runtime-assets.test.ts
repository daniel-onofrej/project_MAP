import { describe, expect, it } from 'vitest'
import {
  deriveRuntimeAssetRequirements,
  mergeRuntimePackages,
  normalizeRuntimePackage,
  runtimeToolCommand,
  runtimeToolPath,
} from '../lib/runtime-assets'
import { agents, agentVersions } from '../db/schema'
import type { AgentConfig } from '../lib/types'

function agentWith(overrides: Partial<AgentConfig>): AgentConfig {
  return {
    id: 'agent-1',
    name: 'Runtime Agent',
    nodes: [],
    connections: [],
    version: '1',
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  }
}

describe('runtime asset packages', () => {
  it('exposes runtime package columns for graphs and versions', () => {
    expect(agents.runtimePackage).toBeDefined()
    expect(agentVersions.runtimePackage).toBeDefined()
  })

  it('normalizes package entries and rejects traversal paths', () => {
    const normalized = normalizeRuntimePackage({
      env: { 'API-BASE': 'https://example.com' },
      tools: [{ name: 'Lookup', command: 'python /sandbox/map/tools/lookup.py', sourceType: 'graph' }],
      scripts: [{ name: 'bad', path: '../bad.sh', content: 'echo no' }],
      files: [
        { path: '../secret.txt', content: 'nope' },
        { path: '/config/runtime.json', content: '{}', sourceType: 'manual' },
      ],
      ports: [{ name: 'api', port: 70000, protocol: 'http', exposure: 'forwarded' }],
    })

    expect(normalized.env).toEqual({ API_BASE: 'https://example.com' })
    expect(normalized.tools[0]).toMatchObject({ name: 'Lookup', sourceType: 'graph' })
    expect(normalized.scripts[0].path).toBe('scripts/bad.sh')
    expect(normalized.files).toEqual([{ path: 'config/runtime.json', content: '{}', sourceType: 'manual' }])
    expect(normalized.ports[0].port).toBe(65535)
  })

  it('detects a missing graph tool requirement', () => {
    const agent = agentWith({
      nodes: [{
        id: 'tool-1',
        type: 'TOOL',
        label: 'OrderLookup',
        description: 'Look up order data',
        config: { tool: 'OrderLookup' },
        position: { x: 0, y: 0 },
      }],
    })

    expect(deriveRuntimeAssetRequirements(agent)).toEqual([expect.objectContaining({
      kind: 'tool',
      name: 'OrderLookup',
      sourceNodeId: 'tool-1',
      sourcePath: runtimeToolPath('OrderLookup'),
      command: runtimeToolCommand('OrderLookup'),
      status: 'missing',
    })])
  })

  it('marks graph tools attached or needing implementation', () => {
    const baseAgent = agentWith({
      nodes: [{
        id: 'tool-1',
        type: 'TOOL',
        label: 'OrderLookup',
        config: { tool: 'OrderLookup' },
        position: { x: 0, y: 0 },
      }],
    })

    expect(deriveRuntimeAssetRequirements({
      ...baseAgent,
      runtimePackage: {
        env: {},
        secretEnv: {},
        tools: [{ name: 'OrderLookup', command: runtimeToolCommand('OrderLookup'), sourceNodeId: 'tool-1', needsImplementation: false }],
        scripts: [],
        files: [],
        ports: [],
        connections: [],
        securityNotes: [],
      },
    })[0].status).toBe('attached')

    expect(deriveRuntimeAssetRequirements({
      ...baseAgent,
      runtimePackage: {
        env: {},
        secretEnv: {},
        tools: [{ name: 'OrderLookup', command: runtimeToolCommand('OrderLookup'), sourceNodeId: 'tool-1', needsImplementation: true }],
        scripts: [],
        files: [],
        ports: [],
        connections: [],
        securityNotes: [],
      },
    })[0].status).toBe('needs implementation')
  })

  it('detects attached startup scripts and package files', () => {
    const agent = agentWith({
      nodes: [{
        id: 'script-1',
        type: 'ACTION',
        label: 'Bootstrap script',
        description: 'Run startup script scripts/bootstrap.sh',
        config: { scriptPath: 'scripts/bootstrap.sh' },
        position: { x: 0, y: 0 },
      }],
      runtimePackage: {
        env: {},
        secretEnv: {},
        tools: [],
        scripts: [{ name: 'Bootstrap script', path: 'scripts/bootstrap.sh', content: 'echo ready', runOnStart: true }],
        files: [{ path: 'config/runtime.json', content: '{}' }],
        ports: [],
        connections: [],
        securityNotes: [],
      },
    })

    expect(deriveRuntimeAssetRequirements(agent)).toEqual([
      expect.objectContaining({ kind: 'script', status: 'attached', matchedPath: 'scripts/bootstrap.sh' }),
      expect.objectContaining({ kind: 'file', status: 'attached', matchedPath: 'config/runtime.json' }),
    ])
  })

  it('merges graph and deployment packages with deployment overrides winning', () => {
    const merged = mergeRuntimePackages(
      {
        env: { FOO: 'graph', KEEP: 'yes' },
        tools: [{ name: 'Lookup', command: 'python graph.py', needsImplementation: true }],
      },
      {
        env: { FOO: 'deploy' },
        tools: [{ name: 'Lookup', command: 'python deploy.py', needsImplementation: false }],
      },
    )

    expect(merged.env).toEqual({ FOO: 'deploy', KEEP: 'yes' })
    expect(merged.tools).toEqual([expect.objectContaining({ command: 'python deploy.py', needsImplementation: false })])
  })
})

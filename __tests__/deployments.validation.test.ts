import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RUNTIME_CATALOG } from '../lib/deployments/catalog'
import { RUNTIME_PRESETS } from '../lib/deployments/types'
import { normalizeDeploymentInput } from '../lib/deployments/validation'

describe('normalizeDeploymentInput', () => {
  it('normalizes a valid deployment request', () => {
    expect(normalizeDeploymentInput({
      agentId: 'agent-1',
      name: '  Support sandbox  ',
      runtimeKind: 'custom',
      runtimeCommand: 'cat {prompt} {input}',
      runtimePackage: {
        env: { FOO: 'bar' },
        secretEnv: { OPENAI_API_KEY: 'OPENAI_API_KEY' },
        tools: [{ name: 'helper', command: 'node helper.js' }],
      },
      policyYaml: 'version: 1\nfilesystem_policy: {}\n',
    })).toEqual({
      agentId: 'agent-1',
      name: 'Support sandbox',
      runtimeKind: 'custom',
      runtimeId: 'custom',
      gatewayId: 'map',
      runtimeCommand: 'cat {prompt} {input}',
      runtimePackage: {
        env: { FOO: 'bar' },
        secretEnv: { OPENAI_API_KEY: 'OPENAI_API_KEY' },
        tools: [{
          name: 'helper',
          command: 'node helper.js',
          description: undefined,
          sourceType: undefined,
          sourceNodeId: undefined,
          sourcePath: undefined,
          needsImplementation: false,
        }],
        scripts: [],
        files: [],
        ports: [],
        connections: [],
        securityNotes: [],
      },
      policyYaml: 'version: 1\nfilesystem_policy: {}',
      sandboxImage: '',
      executionMode: 'oneshot',
      providerMode: 'providers-v2',
      policyMode: 'custom',
      advancedAcknowledgements: [],
      providers: [],
      providerCredentialValues: {},
      resources: {},
      environment: {},
    })
  })

  it('normalizes Gemini CLI runtime and one-time provider credentials', () => {
    expect(normalizeDeploymentInput({
      agentId: 'agent-1',
      name: 'Gemini sandbox',
      runtimeKind: 'gemini-cli',
      runtimeId: 'gemini-cli',
      runtimeCommand: 'gemini -p "$(cat {prompt}) $(cat {input})"',
      sandboxImage: 'gemini',
      providerMode: 'providers-v2',
      providers: [
        {
          templateId: 'google-ai-studio',
          name: 'team-gemini',
          credentialValues: {
            GEMINI_API_KEY: 'secret-once',
          },
        },
      ],
    })).toMatchObject({
      agentId: 'agent-1',
      name: 'Gemini sandbox',
      runtimeKind: 'gemini-cli',
      runtimeId: 'gemini-cli',
      gatewayId: 'map',
      sandboxImage: 'gemini',
      providerMode: 'providers-v2',
      policyMode: 'generated',
      providerCredentialValues: {
        'team-gemini': {
          GEMINI_API_KEY: 'secret-once',
        },
      },
    })
  })

  it('requires a known runtime kind', () => {
    expect(() => normalizeDeploymentInput({
      agentId: 'agent-1',
      name: 'Sandbox',
      runtimeKind: 'unknown',
      runtimeCommand: 'cat {prompt}',
      policyYaml: 'version: 1',
    })).toThrow('Unsupported runtime kind')
  })

  it('requires policy YAML with a version field', () => {
    expect(() => normalizeDeploymentInput({
      agentId: 'agent-1',
      name: 'Sandbox',
      runtimeKind: 'custom',
      runtimeCommand: 'cat {prompt}',
      policyYaml: 'filesystem_policy: {}',
    })).toThrow('version field')
  })

  it('uses the supported Codex exec prompt form', () => {
    const catalogCommand = RUNTIME_CATALOG.find((runtime) => runtime.id === 'codex')?.defaultCommand
    const presetCommand = RUNTIME_PRESETS.find((runtime) => runtime.kind === 'codex')?.command

    expect(catalogCommand).toContain('codex exec "$(printf')
    expect(presetCommand).toContain('codex exec "$(printf')
    expect(catalogCommand).toContain('\\n\\nUser input:\\n')
    expect(presetCommand).toContain('\\n\\nUser input:\\n')
    expect(catalogCommand).not.toMatch(/[\r\n]/)
    expect(presetCommand).not.toMatch(/[\r\n]/)
    expect(catalogCommand).not.toContain('--system-prompt-file')
    expect(presetCommand).not.toContain('--system-prompt-file')
  })

  it('guards Gemini CLI chat output from agent planning text', () => {
    const catalogCommand = RUNTIME_CATALOG.find((runtime) => runtime.id === 'gemini-cli')?.defaultCommand
    const presetCommand = RUNTIME_PRESETS.find((runtime) => runtime.kind === 'gemini-cli')?.command

    for (const command of [catalogCommand, presetCommand]) {
      expect(command).toContain('Runtime response rules:')
      expect(command).toContain('Return only the final user-facing assistant message.')
      expect(command).toContain('Do not describe plans, reasoning, file inspection')
      expect(command).toContain('\\n\\nUser input:\\n%s')
      expect(command).not.toMatch(/[\r\n]/)
    }
  })

  it('guards stale Gemini CLI manifest commands in the worker', () => {
    const workerSource = readFileSync('deployment-worker/src/index.js', 'utf8')

    expect(workerSource).toContain("runtimeId(deployment) === 'gemini-cli'")
    expect(workerSource).toContain('guardedGeminiCommand()')
    expect(workerSource).toContain('gemini -p "$(printf "%s\\\\n\\\\nUser input:\\\\n%s" "$(cat {prompt})" "$(cat {input})")"')
  })
})

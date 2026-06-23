import type { AgentConfig, NodeData } from './types'
import type {
  RuntimeConnection,
  RuntimeFile,
  RuntimePackage,
  RuntimePort,
  RuntimeScript,
  RuntimeTool,
} from './deployments/types'

export type RuntimeAssetRequirementKind = 'tool' | 'script' | 'file'
export type RuntimeAssetRequirementStatus = 'attached' | 'missing' | 'needs implementation'

export type RuntimeAssetRequirement = {
  id: string
  kind: RuntimeAssetRequirementKind
  name: string
  sourceNodeId?: string
  sourcePath?: string
  command?: string
  description?: string
  status: RuntimeAssetRequirementStatus
  matchedPath?: string
}

export const EMPTY_RUNTIME_PACKAGE: RuntimePackage = {
  env: {},
  secretEnv: {},
  tools: [],
  scripts: [],
  files: [],
  ports: [],
  connections: [],
  securityNotes: [],
}

function cleanString(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanPath(value: unknown): string {
  const raw = cleanString(value, 240).replace(/^\/+/, '').replace(/\\/g, '/')
  const parts = raw.split('/')
  if (parts.includes('..')) return ''
  const path = parts
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
  return path
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

function sourceType(value: unknown): 'preset' | 'graph' | 'manual' | undefined {
  return ['preset', 'graph', 'manual'].includes(String(value))
    ? String(value) as 'preset' | 'graph' | 'manual'
    : undefined
}

export function normalizeRuntimePackage(value: unknown): RuntimePackage {
  if (!value || typeof value !== 'object') return { ...EMPTY_RUNTIME_PACKAGE }
  const input = value as Record<string, unknown>

  const tools: RuntimeTool[] = Array.isArray(input.tools)
    ? input.tools.slice(0, 30).map((item) => {
      const tool = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        name: cleanString(tool.name, 120),
        command: cleanString(tool.command, 1000),
        description: cleanString(tool.description, 500) || undefined,
        sourceType: sourceType(tool.sourceType),
        sourceNodeId: cleanString(tool.sourceNodeId, 120) || undefined,
        sourcePath: cleanPath(tool.sourcePath) || undefined,
        needsImplementation: tool.needsImplementation === true,
      }
    }).filter((tool) => tool.name)
    : []

  const scripts: RuntimeScript[] = Array.isArray(input.scripts)
    ? input.scripts.slice(0, 20).map((item) => {
      const script = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const name = cleanString(script.name, 120)
      return {
        name,
        path: cleanPath(script.path) || `scripts/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'script'}.sh`,
        content: cleanString(script.content, 20000),
        runOnStart: script.runOnStart === true,
        sourceType: sourceType(script.sourceType),
        sourceTool: cleanString(script.sourceTool, 120) || undefined,
      }
    }).filter((script) => script.name && script.path && script.content)
    : []

  const files: RuntimeFile[] = Array.isArray(input.files)
    ? input.files.slice(0, 30).map((item) => {
      const file = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        path: cleanPath(file.path),
        content: cleanString(file.content, 30000),
        sourceType: sourceType(file.sourceType),
      }
    }).filter((file) => file.path && file.content)
    : []

  const ports: RuntimePort[] = Array.isArray(input.ports)
    ? input.ports.slice(0, 30).map((item) => {
      const port = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const protocol = ['tcp', 'udp', 'http', 'https'].includes(String(port.protocol))
        ? String(port.protocol) as RuntimePort['protocol']
        : 'tcp'
      const exposure = ['blocked', 'sandbox', 'forwarded'].includes(String(port.exposure))
        ? String(port.exposure) as RuntimePort['exposure']
        : 'blocked'
      return {
        name: cleanString(port.name, 120) || `${protocol}:${Number(port.port) || 0}`,
        port: Math.max(1, Math.min(65535, Number(port.port) || 0)),
        protocol,
        exposure,
        description: cleanString(port.description, 500) || undefined,
      }
    }).filter((port) => port.port > 0)
    : []

  const connections: RuntimeConnection[] = Array.isArray(input.connections)
    ? input.connections.slice(0, 30).map((item) => {
      const connection = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const direction: RuntimeConnection['direction'] = String(connection.direction) === 'inbound' ? 'inbound' : 'outbound'
      return {
        name: cleanString(connection.name, 120),
        target: cleanString(connection.target, 500),
        direction,
        description: cleanString(connection.description, 500) || undefined,
      }
    }).filter((connection) => connection.name && connection.target)
    : []

  const securityNotes = Array.isArray(input.securityNotes)
    ? input.securityNotes.slice(0, 30).map((item) => cleanString(item, 500)).filter(Boolean)
    : []

  return {
    env: cleanEnvRecord(input.env),
    secretEnv: cleanEnvRecord(input.secretEnv),
    tools,
    scripts,
    files,
    ports,
    connections,
    securityNotes,
  }
}

function mergeByKey<T>(base: T[], override: T[], keyOf: (value: T) => string): T[] {
  const map = new Map<string, T>()
  for (const item of base) map.set(keyOf(item), item)
  for (const item of override) map.set(keyOf(item), item)
  return Array.from(map.values())
}

export function mergeRuntimePackages(base: unknown, override: unknown): RuntimePackage {
  const basePackage = normalizeRuntimePackage(base)
  const overridePackage = normalizeRuntimePackage(override)

  return {
    env: { ...basePackage.env, ...overridePackage.env },
    secretEnv: { ...basePackage.secretEnv, ...overridePackage.secretEnv },
    tools: mergeByKey(
      basePackage.tools,
      overridePackage.tools,
      (tool) => `${tool.sourceNodeId || ''}:${tool.name.toLowerCase()}`,
    ),
    scripts: mergeByKey(basePackage.scripts, overridePackage.scripts, (script) => script.path.toLowerCase()),
    files: mergeByKey(basePackage.files, overridePackage.files, (file) => file.path.toLowerCase()),
    ports: mergeByKey(
      basePackage.ports,
      overridePackage.ports,
      (port) => `${port.protocol}:${port.port}:${port.name.toLowerCase()}`,
    ),
    connections: mergeByKey(
      basePackage.connections,
      overridePackage.connections,
      (connection) => `${connection.direction}:${connection.name.toLowerCase()}:${connection.target.toLowerCase()}`,
    ),
    securityNotes: Array.from(new Set([...basePackage.securityNotes, ...overridePackage.securityNotes])),
  }
}

function safeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset'
}

export function runtimeToolPath(toolName: string): string {
  return `tools/${safeSlug(toolName)}.py`
}

export function runtimeToolCommand(toolName: string): string {
  return `python /sandbox/map/${runtimeToolPath(toolName)}`
}

export function runtimeToolStub(tool: Pick<RuntimeTool, 'name' | 'description' | 'sourceNodeId'>): RuntimeFile {
  const safeName = tool.name.replace(/"/g, '\\"')
  return {
    path: runtimeToolPath(tool.name),
    sourceType: 'graph',
    content: [
      '#!/usr/bin/env python3',
      '"""MAP graph tool stub.',
      '',
      `Tool: ${tool.name}`,
      `Source node: ${tool.sourceNodeId ?? 'unknown'}`,
      `Description: ${tool.description ?? 'Generated from MAP graph TOOL node.'}`,
      '"""',
      '',
      'import json',
      'import sys',
      '',
      'def main() -> None:',
      `    payload = {"status": "not_implemented", "tool": "${safeName}"}`,
      '    print(json.dumps(payload))',
      '    sys.exit(2)',
      '',
      'if __name__ == "__main__":',
      '    main()',
      '',
    ].join('\n'),
  }
}

function nodeText(node: NodeData): string {
  return [
    node.label,
    node.description,
    node.rawLine,
    node.config?.logicSnippet,
    node.config?.origSnippet,
    node.config?.command,
    node.config?.script,
    node.config?.scriptPath,
    node.config?.startupScript,
  ].filter(Boolean).join(' ')
}

function toolNameForNode(node: NodeData): string {
  return cleanString(node.config?.tool, 120) || cleanString(node.label, 120) || 'GraphTool'
}

function scriptRequirementForNode(node: NodeData): RuntimeAssetRequirement | null {
  const explicitPath = cleanPath(node.config?.scriptPath || node.config?.path)
  const text = nodeText(node)
  const hasExplicitScript = Boolean(node.config?.script || node.config?.startupScript || explicitPath)
  const mentionsScript = /\b(script|startup|bootstrap)\b/i.test(text) && /\.(sh|bash|zsh|js|mjs|ts|py)\b/i.test(text)
  if (!hasExplicitScript && !mentionsScript) return null

  const name = cleanString(node.config?.scriptName, 120) || cleanString(node.label, 120) || 'Graph script'
  const path = explicitPath || `scripts/${safeSlug(name)}.sh`
  return {
    id: `script:${node.id}:${path}`,
    kind: 'script',
    name,
    sourceNodeId: node.id,
    sourcePath: path,
    description: cleanString(node.description || node.config?.logicSnippet, 500) || undefined,
    status: 'missing',
  }
}

function statusForTool(tool?: RuntimeTool): RuntimeAssetRequirementStatus {
  if (!tool) return 'missing'
  if (tool.needsImplementation || !tool.command.trim()) return 'needs implementation'
  return 'attached'
}

function statusForScript(script?: RuntimeScript): RuntimeAssetRequirementStatus {
  if (!script) return 'missing'
  if (!script.content.trim()) return 'needs implementation'
  return 'attached'
}

export function deriveRuntimeAssetRequirements(agent: AgentConfig): RuntimeAssetRequirement[] {
  const pkg = normalizeRuntimePackage(agent.runtimePackage)
  const requirements: RuntimeAssetRequirement[] = []
  const seen = new Set<string>()

  for (const node of Array.isArray(agent.nodes) ? agent.nodes : []) {
    if (String(node.type).toUpperCase() === 'TOOL') {
      const name = toolNameForNode(node)
      const matched = pkg.tools.find((tool) =>
        tool.sourceNodeId === node.id ||
        tool.name.toLowerCase() === name.toLowerCase() ||
        tool.sourcePath === runtimeToolPath(name)
      )
      const id = `tool:${node.id}:${name.toLowerCase()}`
      if (!seen.has(id)) {
        seen.add(id)
        requirements.push({
          id,
          kind: 'tool',
          name,
          sourceNodeId: node.id,
          sourcePath: matched?.sourcePath || runtimeToolPath(name),
          command: matched?.command || runtimeToolCommand(name),
          description: cleanString(node.description || node.config?.logicSnippet || node.rawLine, 500) || undefined,
          status: statusForTool(matched),
          matchedPath: matched?.sourcePath,
        })
      }
    }

    const scriptRequirement = scriptRequirementForNode(node)
    if (scriptRequirement && !seen.has(scriptRequirement.id)) {
      seen.add(scriptRequirement.id)
      const matched = pkg.scripts.find((script) =>
        script.path.toLowerCase() === scriptRequirement.sourcePath?.toLowerCase() ||
        script.name.toLowerCase() === scriptRequirement.name.toLowerCase() ||
        script.sourceTool?.toLowerCase() === scriptRequirement.name.toLowerCase()
      )
      requirements.push({
        ...scriptRequirement,
        status: statusForScript(matched),
        matchedPath: matched?.path,
      })
    }
  }

  for (const file of pkg.files) {
    const id = `file:${file.path.toLowerCase()}`
    if (seen.has(id)) continue
    seen.add(id)
    requirements.push({
      id,
      kind: 'file',
      name: file.path.split('/').pop() || file.path,
      sourcePath: file.path,
      status: 'attached',
      matchedPath: file.path,
    })
  }

  return requirements
}

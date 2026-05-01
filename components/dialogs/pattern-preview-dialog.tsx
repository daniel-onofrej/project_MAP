'use client'
import { X, Plus, Download } from 'lucide-react'
import { ReactFlow, Background, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { PromptPattern, PatternDomain, PatternComplexity } from '@/lib/types'
import { PATTERN_DOMAINS } from '@/lib/types'

const DOMAIN_COLORS: Record<PatternDomain, string> = {
  finance: 'bg-blue-500/20 text-blue-300',
  'customer-service': 'bg-green-500/20 text-green-300',
  'data-processing': 'bg-purple-500/20 text-purple-300',
  sales: 'bg-orange-500/20 text-orange-300',
  healthcare: 'bg-red-500/20 text-red-300',
  hr: 'bg-pink-500/20 text-pink-300',
  legal: 'bg-slate-500/20 text-slate-300',
  ecommerce: 'bg-yellow-500/20 text-yellow-300',
  devops: 'bg-cyan-500/20 text-cyan-300',
  marketing: 'bg-rose-500/20 text-rose-300',
}

const COMPLEXITY_STYLES: Record<PatternComplexity, string> = {
  simple: 'bg-neutral-600/50 text-neutral-300',
  intermediate: 'bg-amber-500/20 text-amber-300',
  advanced: 'bg-red-500/20 text-red-300',
}

interface Props {
  pattern: PromptPattern | null
  open: boolean
  onClose: () => void
  canInsert: boolean
  onInsert: (pattern: PromptPattern) => void
  onSaveToWorkspace?: (pattern: PromptPattern) => void
  showSaveToWorkspace?: boolean
}

export function PatternPreviewDialog({
  pattern,
  open,
  onClose,
  canInsert,
  onInsert,
  onSaveToWorkspace,
  showSaveToWorkspace = false,
}: Props) {
  if (!open || !pattern) return null

  const rfNodes: Node[] = pattern.nodes.map((n, i) => ({
    id: n.id,
    position: n.position ?? { x: i * 180, y: 0 },
    data: { label: n.label ?? n.type },
    type: 'default',
    style: {
      background: '#2a2a2a',
      border: '1px solid #444',
      color: '#e5e5e5',
      fontSize: '11px',
      borderRadius: '8px',
      padding: '6px 10px',
    },
  }))

  const rfEdges: Edge[] = pattern.connections.map((c) => ({
    id: c.id,
    source: c.source,
    target: c.target,
    label: c.condition,
    style: { stroke: '#555' },
    labelStyle: { fill: '#aaa', fontSize: '10px' },
  }))

  const domainMeta = pattern.domain
    ? PATTERN_DOMAINS.find((d) => d.id === pattern.domain)
    : null
  const complexity = (pattern.complexity ?? 'simple') as PatternComplexity

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl w-[860px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{pattern.icon}</span>
            <span className="text-base font-semibold text-neutral-100">{pattern.name}</span>
            {domainMeta && (
              <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${DOMAIN_COLORS[pattern.domain!]}`}>
                {domainMeta.label}
              </span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${COMPLEXITY_STYLES[complexity]}`}>
              {complexity.charAt(0).toUpperCase() + complexity.slice(1)}
            </span>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body — two panels */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: mini graph */}
          <div className="flex-1 border-r border-neutral-700/50" style={{ height: 380 }}>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              fitView
              nodesDraggable={false}
              nodesConnectable={false}
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              proOptions={{ hideAttribution: true }}
              style={{ background: '#111' }}
            >
              <Background color="#333" gap={16} />
            </ReactFlow>
          </div>

          {/* Right: details */}
          <div className="w-72 flex-shrink-0 flex flex-col overflow-y-auto p-5 gap-4">
            <div>
              <p className="text-xs text-neutral-400">{pattern.description}</p>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1">
              {pattern.tags.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded">
                  {tag}
                </span>
              ))}
            </div>

            {/* Prompt fragment */}
            {pattern.promptFragment && (
              <div>
                <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">Prompt Logic</p>
                <div className="bg-neutral-800/60 rounded-lg p-3 text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {pattern.promptFragment}
                </div>
              </div>
            )}

            {/* Stats */}
            {(pattern.usageCount ?? 0) > 0 && (
              <p className="text-[10px] text-neutral-500">{pattern.usageCount} uses</p>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 mt-auto">
              {showSaveToWorkspace && onSaveToWorkspace && (
                <button
                  onClick={() => onSaveToWorkspace(pattern)}
                  className="flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border border-neutral-600 text-neutral-300 hover:bg-neutral-700/50 transition-colors"
                >
                  <Download size={12} /> Save to Workspace
                </button>
              )}
              <button
                onClick={() => onInsert(pattern)}
                disabled={!canInsert}
                className="flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={12} /> Insert into Graph
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

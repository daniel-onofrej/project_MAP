'use client'
import type { PromptPattern, PatternDomain, PatternComplexity } from '@/lib/types'
import { PATTERN_DOMAINS } from '@/lib/types'
import { Eye, Plus } from 'lucide-react'

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

const NODE_TYPE_COLORS: Record<string, string> = {
  action: 'bg-green-500',
  decision: 'bg-orange-500',
  tool_call: 'bg-blue-500',
  start: 'bg-emerald-400',
  end: 'bg-rose-500',
  step: 'bg-sky-500',
  rule: 'bg-violet-500',
  loop: 'bg-amber-500',
  condition: 'bg-orange-400',
  memory: 'bg-purple-500',
  service: 'bg-teal-500',
  persona: 'bg-pink-500',
  hook: 'bg-indigo-500',
  reference: 'bg-slate-400',
  config: 'bg-gray-400',
  escalation: 'bg-red-400',
  error: 'bg-red-600',
  option: 'bg-sky-400',
  guard: 'bg-red-700',
  handoff: 'bg-purple-400',
  tool: 'bg-yellow-500',
  resolution: 'bg-indigo-400',
}

const MAX_DOTS = 8

interface Props {
  pattern: PromptPattern
  canInsert: boolean
  onPreview: () => void
  onInsert: () => void
}

export function PatternCard({ pattern, canInsert, onPreview, onInsert }: Props) {
  const domainMeta = pattern.domain
    ? PATTERN_DOMAINS.find((d) => d.id === pattern.domain)
    : null
  const complexity = (pattern.complexity ?? 'simple') as PatternComplexity
  const dots = pattern.nodes.slice(0, MAX_DOTS)
  const extraDots = Math.max(0, pattern.nodes.length - MAX_DOTS)

  return (
    <div className="bg-neutral-800/60 border border-neutral-700/50 rounded-xl p-4 flex flex-col gap-3 hover:border-neutral-600 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="text-2xl">{pattern.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-neutral-100 truncate">{pattern.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${COMPLEXITY_STYLES[complexity]}`}>
              {complexity.charAt(0).toUpperCase() + complexity.slice(1)}
            </span>
          </div>
          {domainMeta && (
            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded mt-0.5 font-medium ${DOMAIN_COLORS[pattern.domain!]}`}>
              {domainMeta.label}
            </span>
          )}
        </div>
        <span className="text-[10px] text-neutral-500 bg-neutral-700/50 px-1.5 py-0.5 rounded flex-shrink-0">
          {pattern.nodes.length} nodes
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-neutral-400 line-clamp-2">{pattern.description}</p>

      {/* Node-type dots */}
      <div className="flex items-center gap-1">
        {dots.map((node, i) => {
          const type = (node.type ?? 'action').toLowerCase()
          const color = NODE_TYPE_COLORS[type] ?? 'bg-neutral-500'
          return (
            <div
              key={i}
              title={node.type ?? 'action'}
              className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`}
            />
          )
        })}
        {extraDots > 0 && (
          <span className="text-[10px] text-neutral-500">+{extraDots}</span>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {pattern.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-neutral-700/60 text-neutral-400 rounded">
            {tag}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        <button
          onClick={onPreview}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-neutral-600 text-neutral-300 hover:bg-neutral-700/50 transition-colors flex-1 justify-center"
        >
          <Eye size={12} /> Preview
        </button>
        <button
          onClick={onInsert}
          disabled={!canInsert}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={12} /> Insert
        </button>
      </div>
    </div>
  )
}

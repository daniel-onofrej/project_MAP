'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useState } from 'react'
import { NODE_COLORS, NODE_ICONS, NODE_DESCRIPTIONS } from '@/lib/wiki/data'

/**
 * Animated inline diagrams and interactive mockups for wiki pages.
 */

// ── Graph Preview — stylized fake canvas showing nodes + edges appearing ────
export function GraphPreviewMock({
  nodes,
  edges,
  className = '',
}: {
  nodes: { id: string; type: string; label: string; x: number; y: number }[]
  edges: { from: string; to: string }[]
  className?: string
}) {
  const reduce = useReducedMotion()
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return (
    <div
      className={`relative w-full aspect-[16/9] rounded-lg border border-border/40 bg-[radial-gradient(circle_at_center,theme(colors.muted.DEFAULT/0.25)_0%,transparent_70%)] bg-background overflow-hidden ${className}`}
    >
      <DotGrid />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 900 500" preserveAspectRatio="xMidYMid meet">
        {edges.map((e, i) => {
          const a = nodeMap.get(e.from)
          const b = nodeMap.get(e.to)
          if (!a || !b) return null
          return (
            <motion.path
              key={i}
              d={`M ${a.x + 80} ${a.y + 24} C ${a.x + 80} ${a.y + 80}, ${b.x + 80} ${b.y - 20}, ${b.x + 80} ${b.y + 24}`}
              stroke="hsl(var(--muted-foreground) / 0.5)"
              strokeWidth="1.5"
              fill="none"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.08, ease: 'easeOut' }}
            />
          )
        })}
        {nodes.map((n, i) => {
          const color = NODE_COLORS[n.type] ?? '#888'
          return (
            <motion.g
              key={n.id}
              initial={reduce ? false : { opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.28, delay: i * 0.08, ease: 'easeOut' }}
            >
              <rect
                x={n.x}
                y={n.y}
                width="160"
                height="48"
                rx="8"
                fill={color + '22'}
                stroke={color}
                strokeWidth="1.25"
              />
              <text
                x={n.x + 16}
                y={n.y + 22}
                fontSize="11"
                fontFamily="monospace"
                fill={color}
                fontWeight="600"
              >
                {NODE_ICONS[n.type] ?? '◆'} {n.type}
              </text>
              <text
                x={n.x + 16}
                y={n.y + 38}
                fontSize="12"
                fill="hsl(var(--foreground) / 0.85)"
              >
                {n.label}
              </text>
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}

function DotGrid() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-30" aria-hidden>
      <defs>
        <pattern id="dotgrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" className="text-muted-foreground/30" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dotgrid)" />
    </svg>
  )
}

// ── Sync Diagram — animated prompt ⇌ graph round trip ───────────────────────
export function SyncDiagramMock() {
  const reduce = useReducedMotion()
  return (
    <div className="my-8 rounded-lg border border-border/40 bg-card/30 p-6">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <MiniPromptPanel />
        <SyncArrows reduce={!!reduce} />
        <MiniGraphPanel />
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        <span className="text-xs text-muted-foreground">Similarity score</span>
        <motion.span
          className="text-sm font-mono text-emerald-400"
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: 1.2 }}
        >
          94%
        </motion.span>
      </div>
    </div>
  )
}

function MiniPromptPanel() {
  return (
    <div className="rounded-md border border-border/50 bg-background p-3 font-mono text-[11px] leading-5 text-foreground/75 h-36 overflow-hidden">
      <p className="text-muted-foreground mb-1"># System prompt</p>
      <p>You are a support agent.</p>
      <p>When a user asks about billing,</p>
      <p>classify the intent and...</p>
      <p className="text-muted-foreground/60">...</p>
    </div>
  )
}

function MiniGraphPanel() {
  return (
    <div className="rounded-md border border-border/50 bg-background p-3 h-36 relative">
      <svg viewBox="0 0 160 110" className="w-full h-full">
        <rect x="60" y="4" width="48" height="18" rx="4" fill="#2E7D3222" stroke="#2E7D32" />
        <text x="66" y="17" fontSize="8" fontFamily="monospace" fill="#2E7D32">START</text>
        <path d="M 84 22 L 84 40" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="60" y="42" width="48" height="18" rx="4" fill="#1E88E522" stroke="#1E88E5" />
        <text x="66" y="55" fontSize="8" fontFamily="monospace" fill="#1E88E5">TASK</text>
        <path d="M 84 60 L 84 78" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="60" y="80" width="48" height="18" rx="4" fill="#D32F2F22" stroke="#D32F2F" />
        <text x="66" y="93" fontSize="8" fontFamily="monospace" fill="#D32F2F">END</text>
      </svg>
    </div>
  )
}

function SyncArrows({ reduce }: { reduce: boolean }) {
  return (
    <div className="flex flex-col gap-2 items-center">
      <motion.div
        initial={reduce ? false : { x: -8, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="text-cyan-400 font-mono text-xs flex items-center gap-1"
      >
        →
      </motion.div>
      <motion.div
        initial={reduce ? false : { x: 8, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="text-blue-400 font-mono text-xs flex items-center gap-1"
      >
        ←
      </motion.div>
    </div>
  )
}

// ── Expandable Node Type card ───────────────────────────────────────────────
export function NodeTypeCard({
  type,
  detail,
}: {
  type: string
  detail: {
    whenToUse: string
    example: string
    commonConnections: string[]
    riskCategory?: string
  }
}) {
  const [open, setOpen] = useState(false)
  const color = NODE_COLORS[type] ?? '#888'
  const icon = NODE_ICONS[type] ?? '◆'
  const desc = NODE_DESCRIPTIONS[type] ?? ''
  return (
    <motion.div
      layout
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="rounded-lg border border-border/40 bg-card/40 overflow-hidden"
    >
      <motion.button
        layout
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
        aria-expanded={open}
      >
        <div
          className="h-9 w-9 rounded flex items-center justify-center text-sm shrink-0 font-mono"
          style={{ backgroundColor: color + '22', color }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold font-mono" style={{ color }}>
            {type}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
        </div>
        <span
          className="text-muted-foreground text-xs shrink-0 mt-1"
          aria-hidden
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 180ms' }}
        >
          ▶
        </span>
      </motion.button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-border/40 px-3 py-3 space-y-2 text-[13px] leading-6 bg-background/60"
        >
          <p>
            <span className="text-muted-foreground">When to use:</span>{' '}
            <span className="text-foreground/90">{detail.whenToUse}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Example:</span>{' '}
            <span className="text-foreground/90 italic">&quot;{detail.example}&quot;</span>
          </p>
          <p>
            <span className="text-muted-foreground">Common connections:</span>{' '}
            <span className="text-foreground/90 font-mono text-xs">
              {detail.commonConnections.join(' · ')}
            </span>
          </p>
          {detail.riskCategory && (
            <p>
              <span className="text-muted-foreground">Risk category:</span>{' '}
              <span className="text-foreground/90">{detail.riskCategory}</span>
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}

// ── Diff Mock for versioning page ──────────────────────────────────────────
export function DiffPreviewMock() {
  return (
    <div className="my-8 rounded-lg border border-border/40 bg-card/30 overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-border/40 text-[12px] font-mono leading-6">
        <div className="p-4 bg-red-500/5">
          <p className="text-[10px] uppercase tracking-wider text-red-400 mb-2">v1.2 — before</p>
          <p className="text-foreground/80">
            <span className="text-muted-foreground mr-2">1</span>RULE Classify intent
          </p>
          <p className="text-red-300 bg-red-500/10 -mx-4 px-4">
            <span className="text-muted-foreground mr-2">2</span>- ACTION Auto-refund
          </p>
          <p className="text-foreground/80">
            <span className="text-muted-foreground mr-2">3</span>END
          </p>
        </div>
        <div className="p-4 bg-emerald-500/5">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-2">v1.3 — after</p>
          <p className="text-foreground/80">
            <span className="text-muted-foreground mr-2">1</span>RULE Classify intent
          </p>
          <p className="text-emerald-300 bg-emerald-500/10 -mx-4 px-4">
            <span className="text-muted-foreground mr-2">2</span>+ GUARD Refund policy
          </p>
          <p className="text-emerald-300 bg-emerald-500/10 -mx-4 px-4">
            <span className="text-muted-foreground mr-2">3</span>+ ACTION Auto-refund
          </p>
          <p className="text-foreground/80">
            <span className="text-muted-foreground mr-2">4</span>END
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Hero gradient banner ────────────────────────────────────────────────────
export function HeroBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/40 p-10 md:p-14 bg-gradient-to-br from-cyan-500/10 via-background to-indigo-500/10">
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,theme(colors.cyan.500/0.12),transparent_60%),radial-gradient(circle_at_80%_80%,theme(colors.indigo.500/0.10),transparent_60%)]"
      />
      <div className="relative">{children}</div>
    </div>
  )
}

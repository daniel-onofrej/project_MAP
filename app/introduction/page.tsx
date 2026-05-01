import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Sparkles, GitBranch, Play, Network, RefreshCw,
  FlaskConical, Shield, Globe, BarChart2, MessageSquare,
  Download, Undo2, ChevronDown, Zap, Layout, Copy,
  ArrowRight, Plus, Minus, FileText, GitCompare,
  MessageSquareText, AlertTriangle, Bot, Send,
  CheckCircle2, XCircle, Wrench, CircleDot,
  Terminal, Activity, Eye, Cpu, Layers,
  Keyboard, Library, Plug, ShieldAlert, RotateCcw,
  History, Clock, Mail, Brain
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IntroSidebarNav } from '@/components/intro-sidebar-nav'

export const metadata: Metadata = {
  title: 'Introduction — MAP Agent Architect',
  description: 'Design, build, and manage autonomous AI agents visually. Generate complete agent architectures from natural language, edit by chatting, detect conflicts with AI, and execute agents in real time.',
}

export const dynamic = 'force-static'

// ── Module-level data constants ──

export const FEATURES = [
  { icon: Sparkles, color: 'text-orange-400', bg: 'bg-orange-500/10', title: 'AI Agent Generation', desc: 'Type a description and Gemini 3 Flash builds a complete, structured agent graph in seconds. Optional DAG-aware mode injects structural rules so the AI avoids cycles and disconnected graphs.' },
  { icon: MessageSquareText, color: 'text-cyan-400', bg: 'bg-cyan-500/10', title: 'Graph Chat Editor', desc: 'Edit your graph by chatting — "Add a validation step after intake" — and watch nodes appear instantly.' },
  { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/10', title: 'Bidirectional Re-sync', desc: 'Reconstruct a prompt from the visual graph. Compare any two sources — original prompt, a saved version, or live graph — with word-level inline diffs and a similarity score.' },
  { icon: Network, color: 'text-violet-400', bg: 'bg-violet-500/10', title: 'Visual Graph Editor', desc: 'Interactive drag-and-drop canvas with zoom, pan, minimap, and intelligent auto-layout via Dagre. Supports GROUP container nodes for hierarchy.' },
  { icon: Shield, color: 'text-red-400', bg: 'bg-red-500/10', title: 'DAG Validation Engine', desc: '15 formal DAG rules: acyclicity, topological sort, self-loops, source/sink, reachability, disconnected components, handshaking lemma, transitive reduction hints, and more.' },
  { icon: GitBranch, color: 'text-amber-400', bg: 'bg-amber-500/10', title: 'Branch Version Control', desc: 'Git-like branching history with auto-commits on every edit. Visual SVG branch tree shows parent-child lineage (v1 → v1.1 → v1.2, or branch to v2). Rollback to any snapshot in one click.' },
  { icon: BarChart2, color: 'text-pink-400', bg: 'bg-pink-500/10', title: 'Complexity Metrics', desc: 'Cyclomatic complexity, branching factor, max depth, and actionable optimization suggestions.' },
  { icon: MessageSquare, color: 'text-indigo-400', bg: 'bg-indigo-500/10', title: 'Node Comments', desc: 'Add annotations to individual nodes — document intent, flag edge cases, and keep design notes alongside the graph.' },
  { icon: Download, color: 'text-teal-400', bg: 'bg-teal-500/10', title: 'Export & Import', desc: 'Export as JSON, import from file, paste raw JSON, and toggle between visual graph and text editor.' },
  { icon: Undo2, color: 'text-slate-400', bg: 'bg-slate-500/10', title: 'Undo / Redo & Auto Layout', desc: 'Full command history with Ctrl+Z/Y, plus hierarchical and force-directed graph auto-layout.' },
  { icon: Keyboard, color: 'text-slate-300', bg: 'bg-slate-500/10', title: 'Keyboard Shortcuts', desc: 'Full shortcut reference: Cmd+S save, Cmd+Z/Y undo/redo, Cmd+C/V/D copy/paste/duplicate, Delete to remove, and ? to open the dialog.' },
  { icon: Layers, color: 'text-violet-400', bg: 'bg-violet-500/10', title: 'Multi-Agent Systems', desc: 'Build master-orchestrator + sub-agent architectures. Auto-detect multi-agent prompts, generate linked graphs, and drill into any sub-agent from the master canvas with breadcrumb navigation.' },
]

export const WIP_FEATURES = [
  { icon: FlaskConical, color: 'text-cyan-400', bg: 'bg-cyan-500/10', title: 'Simulation Studio', desc: 'Unified 3-column simulation environment with two modes: instant preview (1 LLM call) and full step-by-step LLM execution. Data flow diffs, condition tracking, pre-flight validation, and rich error reporting.' },
  { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', title: 'AI Conflict Analyzer', desc: 'LLM-powered risk detection with guard bypass analysis, severity filters, and one-click auto-fix. Now includes Google Prompt Engineering whitepaper checks: simplicity score, instruction/constraint ratio, missing examples, output format specificity, and prompting technique recommendations (CoT, ReAct, few-shot).' },
  { icon: Globe, color: 'text-emerald-400', bg: 'bg-emerald-500/10', title: 'Agent Hub', desc: 'Share agents publicly, discover community builds, star ratings, and search by capability.' },
  { icon: Library, color: 'text-purple-400', bg: 'bg-purple-500/10', title: 'Pattern Library', desc: 'Insertable sub-graph patterns — Chain of Thought, Self-Critique Loop, Input Guard, and more. Browse by category, search by tag, and drop directly onto any canvas.', href: '/app' },
  { icon: FlaskConical, color: 'text-pink-400', bg: 'bg-pink-500/10', title: 'Experimental Chat Editor', desc: 'Next-gen AI graph editing with deeper context awareness and multi-step reasoning. Highly experimental — expect rough edges.' },
  { icon: Plug, color: 'text-sky-400', bg: 'bg-sky-500/10', title: 'MCP Server', desc: 'A standalone MCP server exposes all MAP tools — create, edit, validate, run, and analyze agents — accessible from Claude Desktop, Cursor, or any MCP-compatible client.' },
]

export {
  AI_PROVIDERS,
  NODE_COLORS,
  NODE_ICONS,
  NODE_DESCRIPTIONS,
  TEMPLATES,
} from '@/lib/wiki/data'

import {
  AI_PROVIDERS,
  NODE_COLORS,
  NODE_ICONS,
  NODE_DESCRIPTIONS,
  TEMPLATES,
} from '@/lib/wiki/data'

// Canvas: 900×520px. Node width=220px, height≈52px.
// Unified Dagre-style top-down layout (no column frames)
// Flow nodes: centered column, annotation nodes offset left/right
const MOCK_NODES = [
  { label: 'Start', type: 'START', x: 340, y: 24 },
  { label: 'Customer Persona', type: 'PERSONA', x: 52, y: 100, annotation: true },
  { label: 'Safety Guard', type: 'GUARD', x: 628, y: 100, annotation: true },
  { label: 'Classify Intent', type: 'TASK', x: 340, y: 152 },
  { label: 'Billing Rules', type: 'RULE', x: 628, y: 230, annotation: true },
  { label: 'Intent Decision', type: 'DECISION', x: 340, y: 280 },
  { label: 'Search Tool', type: 'TOOL', x: 52, y: 360, annotation: true },
  { label: 'Human Handoff', type: 'HANDOFF', x: 208, y: 400 },
  { label: 'Billing Lookup', type: 'ACTION', x: 472, y: 400 },
]

// Edge paths for unified Dagre layout — type-based coloring
const MOCK_EDGES = [
  // START → Classify Intent (solid indigo, main flow)
  { d: 'M 450 76 C 450 104, 450 122, 450 152', color: '#6366f1', dashed: false },
  // Classify Intent → Intent Decision
  { d: 'M 450 204 C 450 232, 450 250, 450 280', color: '#6366f1', dashed: false },
  // Intent Decision → Human Handoff
  { d: 'M 420 332 C 380 360, 330 380, 318 400', color: '#6366f1', dashed: false },
  // Intent Decision → Billing Lookup
  { d: 'M 480 332 C 510 360, 530 380, 582 400', color: '#6366f1', dashed: false },
  // Customer Persona → Classify Intent (blue dashed, context)
  { d: 'M 272 126 C 310 140, 330 152, 340 178', color: '#3b82f6', dashed: true },
  // Safety Guard → Classify Intent (green dashed, rule/guard)
  { d: 'M 628 126 C 590 140, 570 155, 560 178', color: '#22c55e', dashed: true },
  // Billing Rules → Billing Lookup (green dashed, rule)
  { d: 'M 738 256 C 720 300, 680 360, 692 400', color: '#22c55e', dashed: true },
  // Search Tool → Human Handoff (amber dashed, tool)
  { d: 'M 162 386 C 178 392, 195 398, 208 400', color: '#f59e0b', dashed: true },
]

// Mock chat messages for the Graph Chat preview
const CHAT_MESSAGES = [
  { role: 'user' as const, text: 'Add a data validation step after the intake node' },
  { role: 'assistant' as const, text: 'Added "Validate Input Data" (GUARD) after "User Message" with a connection to "Classify Intent". The node checks for required fields and format compliance.' },
  { role: 'user' as const, text: 'Add a retry loop around the Search Tool with max 3 attempts' },
  { role: 'assistant' as const, text: 'Added a CONDITION node before "Search Tool" with a retry counter in CONFIG. After 3 failed attempts, the CONDITION routes to a HANDOFF node for human escalation.' },
]

// Mock conflicts for the Conflict Analyzer preview — Prompt Quality tab
const MOCK_PROMPT_QUALITY_ISSUES = [
  { severity: 'critical' as const, title: 'Agent is overloaded with constraints', tag: 'cognitive overload', desc: 'Cognitive load score: 100/100. LLMs struggle with this many simultaneous constraints — instructions will be dropped or randomly prioritized.', fixable: true },
  { severity: 'warning' as const, title: 'No examples provided', tag: 'missing examples', desc: 'This agent has no input/output examples. Providing examples is the #1 prompt engineering best practice — it dramatically improves consistency.', fixable: false },
  { severity: 'warning' as const, title: 'Too many constraint statements', tag: 'excessive constraints', desc: '68% of instructions are constraints ("don\'t", "never", "avoid"). Replace with positive instructions instead — constraints conflict with each other and leave the model guessing.', fixable: true },
  { severity: 'info' as const, title: 'END nodes lack output descriptions', tag: 'undefined output', desc: 'The prompt mentions output format, but END nodes have no descriptions. This makes it unclear what each terminal path produces.', fixable: false },
]

// Mock conflicts for the Conflict Analyzer preview
const MOCK_CONFLICTS = [
  { severity: 'critical' as const, title: 'Missing escalation path', desc: 'Decision node "Intent Decision" has no fallback edge — unmatched intents will dead-end.', fixable: true },
  { severity: 'warning' as const, title: 'Orphaned node detected', desc: '"Memory Store" has no outgoing connections — execution will terminate silently after write.', fixable: true },
  { severity: 'info' as const, title: 'Stale threshold value', desc: '"Safety Guard" references a confidence score of 0.7 — industry standard has shifted to 0.85.', fixable: false },
]

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-500' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-500' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-500' },
}

// Mock simulation steps for Simulation Studio mockup
const MOCK_SIM_STEPS = [
  { node: 'Start', type: 'START', status: 'passthrough' as const, output: '', pathTaken: null, dataChanges: 0 },
  { node: 'Safety Guard', type: 'GUARD', status: 'complete' as const, output: 'No harmful patterns detected', pathTaken: 'passed', dataChanges: 0 },
  { node: 'Classify Intent', type: 'TASK', status: 'complete' as const, output: 'billing_dispute (0.94)', pathTaken: null, dataChanges: 2 },
  { node: 'Intent Decision', type: 'DECISION', status: 'complete' as const, output: 'Decision: billing_dispute', pathTaken: 'Billing Flow', dataChanges: 0 },
  { node: 'Billing Lookup', type: 'ACTION', status: 'warning' as const, output: 'No outgoing connection', pathTaken: null, dataChanges: 3 },
]

// Mock data inspector for a selected step
const MOCK_INSPECTOR = {
  input: '"My invoice shows the wrong amount for February"',
  output: '{ "intent": "billing_dispute", "confidence": 0.94 }',
  changes: [
    { field: 'intent', type: 'added' as const, value: '"billing_dispute"' },
    { field: 'confidence', type: 'added' as const, value: '0.94' },
  ],
  conditions: [
    { condition: 'billing_dispute', result: true },
    { condition: 'general_inquiry', result: false },
    { condition: 'cancellation', result: false },
  ],
}

export default function IntroductionPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">

      <IntroSidebarNav />

      {/* ── 1. FIXED NAV ── */}
      <nav className="fixed top-0 inset-x-0 z-50 h-14 bg-background/80 backdrop-blur-md border-b border-border flex items-center px-6">
        <div className="flex items-center gap-2 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="MAP" className="h-5 w-5" width="20" height="20" />
          <span className="font-semibold text-sm">MAP Agent Architect</span>
        </div>
        <Button size="sm" asChild>
          <Link href="/app">Open App</Link>
        </Button>
      </nav>

      {/* ── 2. HERO ── */}
      <section id="hero" className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 pt-14 overflow-hidden scroll-mt-14">
        {/* Background glow using Crail */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(193,95,60,0.18),transparent)]" />
        {/* Dot grid */}
        <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:32px_32px]" />

        <div className="relative z-10 flex flex-col items-center">
          <Badge variant="outline" className="mb-6 gap-1.5 px-3 py-1 text-xs font-medium">
            <Zap className="h-3 w-3 text-[#C15F3C]" />
            Powered by Gemini 3 Flash
          </Badge>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.05] max-w-4xl">
            Design AI Agents <span className="text-[#C15F3C]">Visually.</span>
            <br />Deploy with Confidence.
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Translate plain English prompts into visual graphs to truly understand what your prompt is doing. Build single agents or full multi-agent systems with master orchestrators and linked sub-agents. Catch hidden errors, empty paths, warnings, and dangerous actions before you deploy.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <Button size="lg" className="h-12 px-8 text-base font-semibold shadow-lg shadow-orange-500/20" asChild>
              <Link href="/app">Open Agent Architect →</Link>
            </Button>
          </div>

          {/* Stats strip */}
          <div className="mt-16 grid grid-cols-3 divide-x divide-border border border-border rounded-xl overflow-hidden max-w-sm mx-auto">
            {[
              { value: '22', label: 'Node Types' },
              { value: '5', label: 'Templates' },
              { value: '5', label: 'AI Providers' },
            ].map(({ value, label }) => (
              <div key={label} className="py-4 px-6 text-center bg-card/50">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-muted-foreground animate-bounce will-change-transform">
            <ChevronDown className="h-5 w-5" />
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS ── */}
      <section id="how-it-works" className="py-24 md:py-32 px-4 bg-muted/20 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C15F3C] mb-3 text-center">Workflow</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">How It Works</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-14 text-center">
            From a plain English description to an analyzed, executable agent graph — in four steps.
          </p>

          <div className="flex flex-col md:flex-row items-stretch gap-4 md:gap-0 max-w-5xl mx-auto">

            {/* Step 1 — Describe */}
            <div className="flex-1 rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-orange-400">1</span>
                </div>
                <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-orange-400" />
                </div>
              </div>
              <div>
                <div className="text-base font-semibold mb-1">Describe</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Type a natural language prompt describing the logic you want to visualize. Translating it to a graph helps you truly understand what your prompt is doing — catching empty paths, warnings, and dangerous actions.
                </p>
              </div>
              <div className="rounded-md bg-muted/60 border border-border/60 px-3 py-2 font-mono text-xs text-muted-foreground leading-relaxed flex-1">
                {`"Create a graph for a support agent that routes billing to humans, handles tech issues automatically... to help me understand the logic and catch errors."`}
                <span className="inline-block w-0.5 h-3.5 bg-orange-400 ml-0.5 animate-pulse align-middle" />
              </div>
            </div>

            <div className="flex items-center justify-center px-2 py-2 md:py-0 text-muted-foreground/30">
              <ArrowRight className="h-5 w-5 rotate-90 md:rotate-0" />
            </div>

            {/* Step 2 — Generate */}
            <div className="flex-1 rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-blue-400">2</span>
                </div>
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-blue-400" />
                </div>
              </div>
              <div>
                <div className="text-base font-semibold mb-1">Generate</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Gemini 3 Flash reads your prompt and builds a complete node graph — typed, Dagre-positioned, and connected.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 mt-auto">
                {[
                  { dot: '#f97316', text: '12 nodes created & typed' },
                  { dot: '#3b82f6', text: '9 edges connected' },
                  { dot: '#22c55e', text: 'Conflicts flagged in real time' },
                ].map(({ dot, text }) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                    {text}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-center px-2 py-2 md:py-0 text-muted-foreground/30">
              <ArrowRight className="h-5 w-5 rotate-90 md:rotate-0" />
            </div>

            {/* Step 3 — Edit & Chat */}
            <div className="flex-1 rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-cyan-400">3</span>
                </div>
                <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <MessageSquareText className="h-5 w-5 text-cyan-400" />
                </div>
              </div>
              <div>
                <div className="text-base font-semibold mb-1">Edit & Chat</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Drag nodes visually or type commands in the chat panel — &quot;Add a retry loop around Search Tool&quot;.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-cyan-500/10 border border-cyan-500/20 px-3 py-2 mt-auto">
                <MessageSquareText className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span className="text-xs text-cyan-400 font-medium">Visual + conversational editing</span>
              </div>
            </div>

            <div className="flex items-center justify-center px-2 py-2 md:py-0 text-muted-foreground/30">
              <ArrowRight className="h-5 w-5 rotate-90 md:rotate-0" />
            </div>

            {/* Step 4 — Validate & Execute */}
            <div className="flex-1 rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-green-400">4</span>
                </div>
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Play className="h-5 w-5 text-green-400" />
                </div>
              </div>
              <div>
                <div className="text-base font-semibold mb-1">Analyze &amp; Walk Through</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AI analyzes conflicts, auto-fixes issues, then simulates your agent in Simulation Studio — two modes, data flow tracking, and rich error reporting.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 mt-auto">
                <Activity className="h-3.5 w-3.5 text-green-400 shrink-0" />
                <span className="text-xs text-green-400 font-medium">AI-narrated logic walkthrough</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── 4. VISUAL EDITOR CANVAS PREVIEW ── */}
      <section id="visual-editor" className="py-24 md:py-32 px-4 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3 text-center">Visual Graph Editor</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Your agents, laid out visually</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 text-center">
            The interactive canvas uses intelligent auto-layout via Dagre — nodes are automatically positioned in a clean top-down flow. Annotation nodes (guards, rules, tools, memory) are styled distinctly with dashed borders. Drag nodes to reposition, connect them with typed edges, and use the minimap to navigate large graphs.
          </p>

          {/* Canvas container with new soft warm background */}
          <div className="overflow-x-auto rounded-2xl shadow-[0_0_80px_rgba(193,95,60,0.1)]">
            <div
              className="relative bg-[#3C3936] rounded-2xl border border-border/60 mx-auto"
              style={{ width: 900, height: 520 }}
            >
              {/* Dot grid background */}
              <div className="absolute inset-0 rounded-2xl opacity-50 bg-[radial-gradient(circle,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:20px_20px]" />

              {/* SVG edges */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={900}
                height={520}
              >
                {MOCK_EDGES.map((edge, i) => (
                  <path
                    key={i}
                    d={edge.d}
                    stroke={edge.color}
                    strokeOpacity={edge.dashed ? 0.45 : 0.6}
                    strokeWidth={edge.dashed ? 1.5 : 2}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={edge.dashed ? '6 4' : undefined}
                  />
                ))}
              </svg>

              {/* Mock nodes */}
              {MOCK_NODES.map((node) => (
                <div
                  key={node.label}
                  className="absolute rounded-lg border bg-card shadow-sm"
                  style={{
                    left: node.x,
                    top: node.y,
                    width: (node as any).annotation ? 180 : 220,
                    borderLeftWidth: 4,
                    borderLeftColor: NODE_COLORS[node.type],
                    borderStyle: (node as any).annotation ? 'dashed' : 'solid',
                    borderColor: (node as any).annotation ? `${NODE_COLORS[node.type]}55` : undefined,
                  }}
                >
                  {/* Top handle */}
                  <div
                    className="absolute -top-[5px] left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full border-2 border-card"
                    style={{ backgroundColor: NODE_COLORS[node.type] }}
                  />
                  <div className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm leading-none">{NODE_ICONS[node.type]}</span>
                      <span className="text-xs font-semibold text-foreground leading-tight truncate">{node.label}</span>
                    </div>
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider"
                      style={{ color: NODE_COLORS[node.type] }}
                    >
                      {node.type}
                    </span>
                  </div>
                  {/* Bottom handle */}
                  <div
                    className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full border-2 border-card"
                    style={{ backgroundColor: NODE_COLORS[node.type] }}
                  />
                </div>
              ))}

              {/* Mock toolbar strip */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#484441]/90 border border-zinc-700/60 rounded-lg px-2 py-1">
                {[Layout, Copy, Undo2, Play, Download].map((Icon, i) => (
                  <div key={i} className="p-1 rounded text-zinc-500">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                ))}
              </div>

              {/* Mini-map */}
              <div className="absolute bottom-3 right-3 w-20 h-14 rounded-lg border-2 border-border bg-card shadow-md overflow-hidden">
                {MOCK_NODES.map((node) => (
                  <div
                    key={node.label}
                    className="absolute rounded-[1px]"
                    style={{
                      left: node.x / 900 * 80,
                      top: node.y / 520 * 56,
                      width: 12,
                      height: 4,
                      backgroundColor: NODE_COLORS[node.type],
                      opacity: 0.7,
                    }}
                  />
                ))}
              </div>

              {/* Conflict badge */}
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-[#484441]/90 border border-zinc-700/60 rounded-full px-2 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="text-[9px] text-zinc-400">No conflicts</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. AI GENERATION DEMO ── */}
      <section id="ai-generation" className="py-24 md:py-32 px-4 bg-muted/20 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C15F3C] mb-3 text-center">Prompt Architecture</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Visualize Your Prompt Logic</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-14 text-center">
            Paste your agent&apos;s system prompt or natural language logic. MAP maps the instructions into a structural graph, allowing prompt engineers to audit how the AI interprets boundaries, tools, and transitions. See the &quot;Mental Model&quot; of your agent instantly.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center max-w-5xl mx-auto">
            {/* Left: mock prompt card */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-[#C15F3C]" />
                <span className="text-sm font-semibold text-zinc-200">Analyze Agent Prompt</span>
              </div>
              <div className="rounded-md bg-muted/60 p-4 font-mono text-sm text-muted-foreground min-h-[130px] leading-relaxed">
                {`"You are a Support Agent. Primary goal: Resolve billing issues. If user asks about tech, use TECH_TOOL. If issue unresolved > 3 turns, ESCALATE. Maintain safe tone at all times..."`}
                <span className="inline-block w-0.5 h-4 bg-[#C15F3C] ml-0.5 animate-pulse align-middle" />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-[#C15F3C] animate-pulse" />
                Analyzing logic structure with Gemini...
              </div>
            </div>

            {/* Right: result summary */}
            <div className="flex flex-col gap-5">
              <h3 className="text-2xl font-bold">Structural Audit → Mental Model</h3>
              <p className="text-muted-foreground">
                MAP translates your text instructions into a verifiable architecture. Audit the branching logic, verify safety guards are in-path, and ensure no orphaned edge cases.
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[#C15F3C]/10 border border-[#C15F3C]/20">
                  <span className="text-xl">🤖</span>
                  <div>
                    <div className="text-sm font-semibold text-[#C15F3C]">Logic Mapped</div>
                    <div className="text-xs text-muted-foreground text-[#B1ADA1]">Full hierarchical flow of instructions</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <span className="text-xl">🔗</span>
                  <div>
                    <div className="text-sm font-semibold text-green-400">Context Preserved</div>
                    <div className="text-xs text-muted-foreground">Original prompt bound to graph nodes</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <span className="text-xl">🔄</span>
                  <div>
                    <div className="text-sm font-semibold text-blue-400">Quantifiable Drift</div>
                    <div className="text-xs text-muted-foreground">Track consistency between text & graph</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5b. OUTPUT FORMATS ── */}
      <section id="output-formats" className="py-24 md:py-32 px-4 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C15F3C] mb-3 text-center">LLM Output Formats</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Three Formats. One Graph.</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-14 text-center">
            MAP supports three output formats from the LLM — each producing the same graph but optimized for different trade-offs between readability, token efficiency, and generation speed.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">

            {/* JSON Standard */}
            <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full" />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-base font-semibold">JSON</div>
                  <Badge variant="outline" className="text-[10px] px-2 py-0 text-blue-400 border-blue-500/30">Standard</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Full verbose JSON with all fields explicitly spelled out. Maximum readability, ideal for debugging and manual inspection.
              </p>
              <div className="rounded-md bg-[#3C3936] border border-border/60 p-3 font-mono text-[10px] text-zinc-400 leading-relaxed flex-1 overflow-hidden">
                <div className="text-blue-400">{`{`}</div>
                <div className="pl-3">{`"metadata": {`}</div>
                <div className="pl-6">{`"agent_id": "support_bot",`}</div>
                <div className="pl-6">{`"persona": "Support Agent"`}</div>
                <div className="pl-3">{`},`}</div>
                <div className="pl-3">{`"graph": {`}</div>
                <div className="pl-6 text-zinc-500">{`"nodes": [...],`}</div>
                <div className="pl-6 text-zinc-500">{`"edges": [...]`}</div>
                <div className="pl-3">{`}`}</div>
                <div className="text-blue-400">{`}`}</div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
                <span className="font-mono">~6K chars</span>
                <span className="text-zinc-600">•</span>
                <span className="font-mono">~2K tokens</span>
              </div>
            </div>

            {/* YAML */}
            <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full" />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#B1ADA1]/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-[#B1ADA1]" />
                </div>
                <div>
                  <div className="text-base font-semibold">YAML</div>
                  <Badge variant="outline" className="text-[10px] px-2 py-0 text-[#B1ADA1] border-[#B1ADA1]/30">Human-Friendly</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Indentation-based format with no braces or brackets. Excellent readability, slightly more tokens than JSON.
              </p>
              <div className="rounded-md bg-[#3C3936] border border-border/60 p-3 font-mono text-[10px] text-zinc-400 leading-relaxed flex-1 overflow-hidden">
                <div className="text-amber-400">metadata:</div>
                <div className="pl-3">agent_id: support_bot</div>
                <div className="pl-3">persona: Support Agent</div>
                <div className="text-amber-400">graph:</div>
                <div className="pl-3 text-zinc-500">nodes:</div>
                <div className="pl-6 text-zinc-500">- id: n1</div>
                <div className="pl-8 text-zinc-500">type: start</div>
                <div className="pl-8 text-zinc-500">label: Start Agent</div>
                <div className="pl-3 text-zinc-500">edges:</div>
                <div className="pl-6 text-zinc-500">- source: n1</div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
                <span className="font-mono">~8K chars</span>
                <span className="text-zinc-600">•</span>
                <span className="font-mono">~2.2K tokens</span>
              </div>
            </div>

            {/* JSON Compact */}
            <div className="rounded-xl border-2 border-emerald-500/30 bg-card p-6 flex flex-col gap-4 relative overflow-hidden shadow-[0_0_40px_rgba(16,185,129,0.08)]">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full" />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-base font-semibold">JSON Compact</div>
                  <Badge variant="outline" className="text-[10px] px-2 py-0 text-emerald-400 border-emerald-500/30">Fastest</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Array tuples with type codes and integer IDs. Decoder expands to full graph. Up to <span className="text-emerald-400 font-semibold italic">66% fewer tokens</span>.
              </p>
              <div className="rounded-md bg-[#3C3936] border border-border/60 p-3 font-mono text-[10px] text-zinc-400 leading-relaxed flex-1 overflow-hidden">
                <div className="text-emerald-400">{`{"m":[...],"g":{`}</div>
                <div className="pl-3">{`"n":[`}</div>
                <div className="pl-6 text-emerald-300">{`[1,"st","Start","Entry","c"],`}</div>
                <div className="pl-6 text-emerald-300">{`[2,"d","Route?","Check type","c"],`}</div>
                <div className="pl-6 text-zinc-500">{`...`}</div>
                <div className="pl-3">{`],"e":[`}</div>
                <div className="pl-6 text-emerald-300">{`[1,2,"Next"],`}</div>
                <div className="pl-6 text-zinc-500">{`...`}</div>
                <div className="pl-3">{`]}}`}</div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
                <span className="font-mono text-emerald-400 font-semibold">~2.4K chars</span>
                <span className="text-zinc-600">•</span>
                <span className="font-mono text-emerald-400 font-semibold">~780 tokens</span>
              </div>
            </div>

          </div>

          {/* Benchmark comparison bar */}
          <div className="max-w-3xl mx-auto rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <BarChart2 className="h-4 w-4 text-[#C15F3C]" />
              <span className="text-sm font-semibold text-zinc-200">Benchmark Comparison</span>
              <Badge variant="outline" className="text-[10px] px-2 py-0 text-muted-foreground ml-auto">gemini-3-flash-preview</Badge>
            </div>

            <div className="flex flex-col gap-3">
              {[
                { label: 'JSON', raw: 6106, tokens: 1931, color: 'bg-blue-500/30', pct: 75 },
                { label: 'YAML', raw: 8102, tokens: 2265, color: 'bg-amber-500/30', pct: 100 },
                { label: 'JSON Compact', raw: 2407, tokens: 778, color: 'bg-[#C15F3C]', pct: 30 },
              ].map(({ label, raw, tokens, color, pct }) => (
                <div key={label} className="grid grid-cols-[120px_1fr_80px_80px] items-center gap-3">
                  <span className="text-xs font-medium">{label}</span>
                  <div className="h-3 rounded-full bg-muted/40 overflow-hidden">
                    <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground text-right">{raw.toLocaleString()} chars</span>
                  <span className="text-xs font-mono text-muted-foreground text-right">{tokens.toLocaleString()} tok</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-emerald-400" />
                <span>JSON Compact: <span className="text-emerald-400 font-semibold">61% fewer chars, 60% fewer tokens</span> vs JSON</span>
              </span>
            </div>
          </div>

        </div>
      </section>

      {/* ── 6. GRAPH CHAT EDITOR ── */}
      <section id="graph-chat" className="py-24 md:py-32 px-4 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-500 mb-3 text-center">Graph Chat</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Edit Your Graph by Chatting</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-14 text-center">
            The Graph Chat panel sends your instruction plus the full graph context to Gemini. It interprets commands like &quot;add a retry loop around Search Tool&quot; and generates precise graph mutations — adding, removing, or updating nodes and edges. Every edit shows stats: nodes added, removed, or updated.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start max-w-5xl mx-auto">

            {/* Left: mock chat panel — 3/5 columns */}
            <div className="lg:col-span-3 rounded-xl border border-border bg-[#3C3936] shadow-[0_0_60px_rgba(6,182,212,0.07)] overflow-hidden">

              {/* Chat header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[#484441]/80">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="text-sm font-semibold text-zinc-200">Graph Chat</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors">
                    <FlaskConical className="h-3.5 w-3.5" />
                  </button>
                  <Badge variant="outline" className="text-[10px] px-2 py-0 text-cyan-400 border-cyan-500/30">
                    AI-Powered
                  </Badge>
                </div>
              </div>

              {/* Chat messages */}
              <div className="p-4 flex flex-col gap-3 min-h-[280px]">
                {CHAT_MESSAGES.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[88%] px-3 py-2 text-xs leading-relaxed ${msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                        : 'bg-muted/60 border border-border text-foreground rounded-2xl rounded-tl-sm'
                        }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Bot className="h-3 w-3 text-cyan-400" />
                          <span className="text-[10px] font-semibold text-cyan-400">MAP</span>
                        </div>
                      )}
                      {msg.text}
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-2 mt-2 text-[10px]">
                          <span className="text-green-500 dark:text-green-400 font-mono">+2 nodes</span>
                          <span className="text-green-500 dark:text-green-400 font-mono">+1 edges</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat input */}
              <div className="px-4 py-3 border-t border-border bg-background">
                <div className="flex items-center gap-2 rounded-lg bg-muted/60 border border-border px-3 py-2">
                  <span className="text-xs text-muted-foreground flex-1">Type a command to edit the graph…</span>
                  <Send className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-1.5 text-right">Ctrl+Enter to send</p>
              </div>
            </div>

            {/* Right: explanatory text — 2/5 columns */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <MessageSquareText className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="text-xl font-bold">Conversational Graph Editing</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The Graph Chat panel uses Gemini to understand your instructions in context. It reads your entire graph, figures out the right mutation, and applies it — adding, removing, or updating nodes and edges.
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                {[
                  { icon: Plus, label: 'Add nodes', desc: '"Add a data validation step after the intake node"', color: 'text-green-400' },
                  { icon: Wrench, label: 'Modify nodes', desc: '"Change the retry count on Search Tool to 5"', color: 'text-amber-400' },
                  { icon: Minus, label: 'Remove nodes', desc: '"Remove the logging node, it\'s not needed"', color: 'text-red-400' },
                  { icon: Layers, label: 'Restructure', desc: '"Wrap the tool calls in a retry loop"', color: 'text-blue-400' },
                ].map(({ icon: Icon, label, desc, color }) => (
                  <div key={label} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/30">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                    <div>
                      <div className="text-xs font-semibold mb-0.5">{label}</div>
                      <div className="text-[11px] text-muted-foreground font-mono leading-relaxed">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── 7. RE-SYNC DIFF SHOWCASE ── */}
      <section id="resync" className="py-24 md:py-32 px-4 bg-muted/20 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3 text-center">Bidirectional Re-sync</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Compare Any Two Versions</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-14 text-center">
            Re-sync reconstructs a prompt from any graph state — no AI call needed. Use the dropdowns to pick which two sources to compare: your original prompt, any saved version snapshot, or the live graph. Word-level diffs and a similarity score quantify exactly how much things have drifted.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

            {/* Left: diff viewer mock — 3/5 columns */}
            <div className="lg:col-span-3 rounded-xl border border-border bg-[#3C3936] shadow-[0_0_60px_rgba(193,95,60,0.07)] overflow-hidden">

              {/* Header bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[#484441]/80 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-sm font-semibold text-zinc-200">Prompt Re-sync</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-mono font-semibold bg-green-500/15 text-green-400 border-green-800">
                    87% match
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-0.5 text-green-400">
                      <Plus className="h-3 w-3" />2 added
                    </span>
                    <span className="flex items-center gap-0.5 text-red-400">
                      <Minus className="h-3 w-3" />1 removed
                    </span>
                  </div>
                </div>
              </div>

              {/* Two-pane diff body */}
              <div className="flex divide-x divide-border overflow-x-auto">

                {/* Left pane — source selector */}
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="px-4 py-2 border-b border-border bg-[#484441]/50 shrink-0 flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-md border border-border bg-[#3C3936] px-2 py-1 text-[10px] text-zinc-300 flex-1">
                      <span>Original Prompt</span>
                      <ChevronDown className="h-2.5 w-2.5 ml-auto text-zinc-500" />
                    </div>
                  </div>
                  <table className="w-full border-collapse font-mono text-xs leading-6">
                    <tbody>
                      <tr>
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">1</td>
                        <td className="px-3 py-0.5 text-zinc-300 whitespace-pre-wrap align-top">You are a customer support agent.</td>
                      </tr>
                      <tr>
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">2</td>
                        <td className="px-3 py-0.5 text-zinc-300 whitespace-pre-wrap align-top">Classify incoming user intents accurately.</td>
                      </tr>
                      <tr>
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">3</td>
                        <td className="px-3 py-0.5 text-zinc-300 whitespace-pre-wrap align-top">Route billing queries to <span className="bg-amber-500/20 text-amber-300 px-0.5 rounded-sm">human</span> agents.</td>
                      </tr>
                      {/* Removed line — red */}
                      <tr className="bg-red-500/10">
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">4</td>
                        <td className="px-3 py-0.5 text-red-400 whitespace-pre-wrap align-top">- Store <span className="bg-red-500/30 px-0.5 rounded-sm">interaction history</span> to memory after each turn.</td>
                      </tr>
                      <tr className="bg-green-500/5">
                        <td className="w-8 px-2 py-0.5 border-r border-border/40 shrink-0">&nbsp;</td>
                        <td className="px-3 py-0.5 text-transparent select-none whitespace-pre-wrap">- Applies safety filter before all responses.</td>
                      </tr>
                      <tr className="bg-green-500/5">
                        <td className="w-8 px-2 py-0.5 border-r border-border/40 shrink-0">&nbsp;</td>
                        <td className="px-3 py-0.5 text-transparent select-none whitespace-pre-wrap">- Blocks inappropriate content automatically.</td>
                      </tr>
                      <tr>
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">5</td>
                        <td className="px-3 py-0.5 text-zinc-300 whitespace-pre-wrap align-top">Escalate unresolved cases after 3 failed attempts.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Right pane — source selector */}
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="px-4 py-2 border-b border-border bg-[#484441]/50 shrink-0 flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-md border border-[#C15F3C]/40 bg-[#3C3936] px-2 py-1 text-[10px] text-zinc-300 flex-1">
                      <span>v2.2 — Updated safety thresholds</span>
                      <ChevronDown className="h-2.5 w-2.5 ml-auto text-zinc-500" />
                    </div>
                  </div>
                  <table className="w-full border-collapse font-mono text-xs leading-6">
                    <tbody>
                      <tr>
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">1</td>
                        <td className="px-3 py-0.5 text-zinc-300 whitespace-pre-wrap align-top">You are a customer support agent.</td>
                      </tr>
                      <tr>
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">2</td>
                        <td className="px-3 py-0.5 text-zinc-300 whitespace-pre-wrap align-top">Classify incoming user intents accurately.</td>
                      </tr>
                      <tr>
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">3</td>
                        <td className="px-3 py-0.5 text-zinc-300 whitespace-pre-wrap align-top">Route billing queries to <span className="bg-amber-500/20 text-amber-300 px-0.5 rounded-sm">support</span> agents.</td>
                      </tr>
                      <tr className="bg-red-500/5">
                        <td className="w-8 px-2 py-0.5 border-r border-border/40 shrink-0">&nbsp;</td>
                        <td className="px-3 py-0.5 text-transparent select-none whitespace-pre-wrap">- Store interaction history to memory.</td>
                      </tr>
                      {/* Added lines — green */}
                      <tr className="bg-green-500/10">
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">4</td>
                        <td className="px-3 py-0.5 text-green-400 whitespace-pre-wrap align-top">- Applies <span className="bg-green-500/30 px-0.5 rounded-sm">safety filter</span> before all responses.</td>
                      </tr>
                      <tr className="bg-green-500/10">
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">5</td>
                        <td className="px-3 py-0.5 text-green-400 whitespace-pre-wrap align-top">- Blocks <span className="bg-green-500/30 px-0.5 rounded-sm">inappropriate</span> content automatically.</td>
                      </tr>
                      <tr>
                        <td className="w-8 px-2 py-0.5 text-right text-zinc-600 select-none border-r border-border/40 shrink-0 align-top">6</td>
                        <td className="px-3 py-0.5 text-zinc-300 whitespace-pre-wrap align-top">Escalate unresolved cases after 3 failed attempts.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>
            </div>

            {/* Right: explanatory text — 2/5 columns */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <GitCompare className="h-5 w-5 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold">What Re-sync Does</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Use the dropdowns to choose any two sources to diff: original prompt, any saved version snapshot, or the live graph. Re-sync walks the graph using stored source positions, node order, and logic snippets to reconstruct a faithful prompt — no AI call. The Jaccard word-overlap score gives you a single number: how far apart the two sources are.
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                {[
                  {
                    rowBg: 'bg-red-500/10 border-red-500/20',
                    dot: 'bg-red-500',
                    label: 'Red rows',
                    desc: 'Lines present in the left source but absent from the right — nodes or rules that were removed or changed between versions.',
                  },
                  {
                    rowBg: 'bg-green-500/10 border-green-500/20',
                    dot: 'bg-green-500',
                    label: 'Green rows',
                    desc: 'New behaviors in the right-side source that aren\'t in the left — nodes or rules that were added in this version.',
                  },
                  {
                    rowBg: 'bg-amber-500/10 border-amber-500/20',
                    dot: 'bg-amber-500',
                    label: 'Highlighted words',
                    desc: 'Individual tokens that changed between original and reconstructed — word-level precision for subtle drift.',
                  },
                ].map(({ rowBg, dot, label, desc }) => (
                  <div key={label} className={`flex items-start gap-3 p-3 rounded-lg border ${rowBg}`}>
                    <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
                    <div>
                      <div className="text-xs font-semibold mb-0.5">{label}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="h-4 w-4 text-orange-400" />
                  <span className="text-sm font-semibold text-orange-400">Why it matters</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Visual graph edits are intuitive but can silently lose intent. Compare any two snapshots — including branched versions — to quantify exactly what changed between any two points in your agent&apos;s history.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>
      {/* ── 7b. VERSION CONTROL ── */}
      <section id="version-control" className="py-24 md:py-32 px-4 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C15F3C] mb-3 text-center">Branch Version Control</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Git-Like Branching History</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-14 text-center">
            Every node add, delete, and edit auto-commits a snapshot. Versions branch like git — edits on v1 create v1.1, v1.2; a fresh start creates v2. The SVG branch tree shows exactly which version each commit descended from.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start max-w-5xl mx-auto">
            {/* Left: explaining logic — 2/5 columns */}
            <div className="lg:col-span-2 flex flex-col gap-6 order-2 lg:order-1">
              <div className="flex flex-col gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#C15F3C]/10 flex items-center justify-center">
                  <GitBranch className="h-5 w-5 text-[#C15F3C]" />
                </div>
                <h3 className="text-xl font-bold">Branching Lineage</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Unlike a flat version list, MAP tracks which snapshot each commit descended from. If you restore v1 and make edits, those edits branch off v1 — not from the latest. The visual tree makes this lineage immediately visible.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {[
                  'Auto-commit on every node add / delete / edit',
                  'AI generation creates no version — first edit creates v1',
                  'Edits on sub-versions create v1.1, v1.2, v1.3…',
                  'New branch from original creates v2, v3…',
                  'Visual SVG dot-and-line branch tree',
                  'Instant rollback to any snapshot',
                  'Diff stats: nodes added, removed, modified',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#C15F3C] shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Mock version panel — 3/5 columns */}
            <div className="lg:col-span-3 rounded-xl border border-border bg-[#3C3936] shadow-[0_0_60px_rgba(193,95,60,0.07)] overflow-hidden order-1 lg:order-2">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[#484441]/80">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-[#C15F3C]" />
                  <span className="text-sm font-semibold text-zinc-200">Version Control</span>
                </div>
                <Badge variant="outline" className="text-[10px] px-2 py-0 border-[#C15F3C]/30 text-[#C15F3C]">
                  6 Commits
                </Badge>
              </div>

              {/* Commit bar */}
              <div className="px-4 py-2 border-b border-border bg-[#484441]/50 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">v2.3</span>
                <div className="flex-1 h-6 rounded bg-[#3C3936] border border-border/60 px-2 flex items-center">
                  <span className="text-[10px] text-zinc-500">Describe your changes…</span>
                </div>
                <div className="h-6 px-3 rounded bg-primary flex items-center text-[10px] text-primary-foreground font-medium shrink-0">Commit</div>
              </div>

              {/* Two-column: SVG tree left, cards right */}
              <div className="flex min-h-[240px]">

                {/* SVG branch tree — row height 36px, dot centers: v1=18, v1.1=54, v1.2=90, v2=126, v2.1=162, v2.2=198 */}
                <div className="border-r border-border shrink-0 py-0 px-1">
                  <svg width="64" height="216" className="overflow-visible">
                    {/* Blue root trunk: v1 → v2 (root column x=16, spans rows 0-3) */}
                    <line x1="16" y1="18" x2="16" y2="126" stroke="#3b82f6" strokeWidth="1.5" />
                    {/* Blue sub-branch elbow: v1 → v1.1 */}
                    <line x1="16" y1="18" x2="44" y2="54" stroke="#3b82f6" strokeWidth="1.5" />
                    {/* Blue sub: v1.1 → v1.2 */}
                    <line x1="44" y1="54" x2="44" y2="90" stroke="#3b82f6" strokeWidth="1.5" />

                    {/* Green root trunk: v2 downward (root column x=16) */}
                    <line x1="16" y1="126" x2="16" y2="198" stroke="#22c55e" strokeWidth="1.5" />
                    {/* Green sub-branch elbow: v2 → v2.1 */}
                    <line x1="16" y1="126" x2="44" y2="162" stroke="#22c55e" strokeWidth="1.5" />
                    {/* Green sub: v2.1 → v2.2 */}
                    <line x1="44" y1="162" x2="44" y2="198" stroke="#22c55e" strokeWidth="1.5" />

                    {/* Dots drawn last (on top of lines) */}
                    <circle cx="16" cy="18" r="4" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="1.5" />
                    <circle cx="44" cy="54" r="4" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="1.5" />
                    <circle cx="44" cy="90" r="4" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="1.5" />
                    <circle cx="16" cy="126" r="4" fill="#14291a" stroke="#22c55e" strokeWidth="1.5" />
                    <circle cx="44" cy="162" r="4" fill="#14291a" stroke="#22c55e" strokeWidth="1.5" />
                    {/* v2.2 active — filled + dashed ring */}
                    <circle cx="44" cy="198" r="5" fill="#22c55e" stroke="#22c55e" strokeWidth="1.5" />
                    <circle cx="44" cy="198" r="9" fill="none" stroke="#22c55e" strokeWidth="1" strokeDasharray="3 2" opacity="0.5" />
                  </svg>
                </div>

                {/* Version cards */}
                <div className="flex-1 overflow-y-auto divide-y divide-border">
                  {[
                    { label: 'v1', msg: 'Added safety guard and persona', time: 'Yesterday', color: '#3b82f6', active: false },
                    { label: 'v1.1', msg: 'Tweaked intent classifier output format', time: '8h ago', color: '#3b82f6', active: false },
                    { label: 'v1.2', msg: 'Removed unused logging node', time: '7h ago', color: '#3b82f6', active: false },
                    { label: 'v2', msg: 'Restored v1, added billing escalation', time: '4h ago', color: '#22c55e', active: false },
                    { label: 'v2.1', msg: 'Retry loop around Search Tool', time: '2h ago', color: '#22c55e', active: false },
                    { label: 'v2.2', msg: 'Updated safety thresholds', time: 'Just now', color: '#22c55e', active: true },
                  ].map(({ label, msg, time, color, active }) => (
                    <div key={label} className={`px-3 py-2 flex items-center gap-2 min-w-0 border-l-2 ${active ? '' : 'border-transparent'}`} style={active ? { borderLeftColor: color } : undefined}>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: color + '22', color }}>
                        {label}
                      </span>
                      <span className="text-[11px] text-zinc-300 flex-1 min-w-0 truncate">{msg}</span>
                      <span className="text-[9px] text-zinc-500 shrink-0 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />{time}
                      </span>
                      {active
                        ? <span className="text-[9px] text-muted-foreground italic shrink-0">active</span>
                        : <div className="h-5 px-1.5 rounded border border-border text-[9px] text-zinc-400 flex items-center shrink-0">Restore</div>
                      }
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. CONFLICT & DAG VALIDATION (MERGED) ── */}
      <section id="conflict-dag" className="py-24 md:py-32 px-4 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C15F3C] mb-3 text-center">AI Conflict Detection + DAG Validation</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Catch Issues Before They Ship</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-14 text-center">
            Two validation layers protect your graph. The DAG Validation Engine runs 15 deterministic structural rules instantly. The AI Conflict Analyzer goes further — LLM-powered risk detection, guard bypass analysis, and semantic reasoning, plus a full suite of Google Prompt Engineering whitepaper checks: simplicity scoring, instruction/constraint ratio, missing examples detection, output format specificity, and prompting technique recommendations.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start max-w-5xl mx-auto">

            {/* Left: mock conflict panel + DAG rules — 3/5 columns */}
            <div className="lg:col-span-3 flex flex-col gap-6">

              {/* Conflict panel */}
              <div className="rounded-xl border border-border bg-[#3C3936] shadow-[0_0_60px_rgba(193,95,60,0.07)] overflow-hidden">

                {/* Header bar */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[#484441]/80 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3.5 w-3.5 text-[#C15F3C]" />
                    <span className="text-sm font-semibold text-zinc-200">AI Conflict Analyzer</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[
                      { count: 1, label: 'Critical', color: 'text-red-400 bg-red-500/15 border-red-800' },
                      { count: 1, label: 'Warning', color: 'text-[#C15F3C] bg-[#C15F3C]/15 border-[#C15F3C]/40' },
                      { count: 1, label: 'Info', color: 'text-blue-400 bg-blue-500/15 border-blue-800' },
                    ].map(({ count, label, color }) => (
                      <span key={label} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color}`}>
                        {count} {label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tab row */}
                <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50 bg-[#484441]/40">
                  {['Prompt Quality', 'Safety & Permissions', 'Structure'].map((tab, i) => (
                    <span
                      key={tab}
                      className={`text-[11px] px-2 py-1.5 rounded-md font-medium ${i === 0
                        ? 'bg-[#C15F3C]/15 text-[#C15F3C]'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                      {tab}
                      {i === 0 && <span className="ml-1 text-[9px] opacity-60">4</span>}
                    </span>
                  ))}
                </div>

                {/* Severity filter chips */}
                <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border/30 bg-[#484441]/20">
                  <span className="text-[10px] text-zinc-600 mr-1">Filter:</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-red-800 bg-red-500/15 text-red-400">critical (1)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#C15F3C]/60 bg-[#C15F3C]/15 text-[#C15F3C]">warning (2)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-800 bg-blue-500/15 text-blue-400">info (1)</span>
                </div>

                {/* Prompt Quality metrics + issues */}
                <div className="p-4 flex flex-col gap-3">

                  {/* Cognitive Load bar */}
                  <div className="rounded-lg border border-border p-3 space-y-2 bg-[#484441]/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-zinc-400" />
                        <span className="text-xs font-medium text-zinc-200">Cognitive Load</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500">1 rules, 1 depth</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-red-800 bg-red-500/15 text-red-400">100/100</span>
                      </div>
                    </div>
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#524F4C]">
                      <div className="h-full rounded-full bg-destructive" style={{ width: '100%' }} />
                    </div>
                  </div>

                  {/* Simplicity Score bar */}
                  <div className="rounded-lg border border-border p-3 space-y-2 bg-[#484441]/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-zinc-400" />
                        <span className="text-xs font-medium text-zinc-200">Simplicity</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500">avg 28w/sentence</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-amber-700 bg-amber-500/15 text-amber-400">42/100</span>
                      </div>
                    </div>
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#524F4C]">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: '42%' }} />
                    </div>
                  </div>

                  {/* Instruction/Constraint Ratio */}
                  <div className="rounded-lg border border-border p-3 space-y-1.5 bg-[#484441]/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-zinc-400" />
                        <span className="text-xs font-medium text-zinc-200">Instructions vs. Constraints</span>
                      </div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-red-800 bg-red-500/15 text-red-400">32% instructions</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-green-400 font-medium">8 instructions</span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-red-400 font-medium">17 constraints</span>
                    </div>
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#524F4C]">
                      <div className="h-full rounded-full bg-destructive" style={{ width: '32%' }} />
                    </div>
                  </div>

                  {/* Prompt quality issues */}
                  {MOCK_PROMPT_QUALITY_ISSUES.map((issue) => {
                    const s = SEVERITY_STYLES[issue.severity];
                    return (
                      <div key={issue.title} className={`rounded-lg border p-3 ${s.bg} ${s.border}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
                            <div className="min-w-0">
                              <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                                <span className={`text-xs font-semibold ${s.text}`}>{issue.title}</span>
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${s.border} ${s.text} opacity-70`}>{issue.tag}</span>
                              </div>
                              <p className="text-[11px] text-zinc-400 leading-relaxed">{issue.desc}</p>
                            </div>
                          </div>
                          {issue.fixable && (
                            <Button variant="outline" size="sm" className="shrink-0 h-6 text-[10px] px-2">
                              <Wrench className="h-3 w-3 mr-1" />
                              Fix
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-border bg-[#484441]/50 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">4 issues · 2 auto-fixable</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#C15F3C] font-medium">
                    <Sparkles className="h-3 w-3" />
                    Fix All in Tab
                  </div>
                </div>
              </div>

              {/* DAG rule tiers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Critical rules */}
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span className="text-sm font-semibold text-red-400">Critical</span>
                  </div>
                  <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
                    {['No self-loops', 'No directed cycles', 'Source node exists', 'Sink node exists'].map(r => (
                      <li key={r} className="flex items-center gap-2">
                        <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Warning rules */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <span className="text-sm font-semibold text-amber-400">Warning</span>
                  </div>
                  <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
                    {['Topological sortability', 'Reachability from sources', 'Path to sink exists', 'No disconnected components', 'No duplicate edges'].map(r => (
                      <li key={r} className="flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Info rules */}
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    <span className="text-sm font-semibold text-blue-400">Info</span>
                  </div>
                  <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
                    {['Handshaking lemma check', 'High-degree node alerts', 'Transitive reduction hints'].map(r => (
                      <li key={r} className="flex items-center gap-2">
                        <CircleDot className="h-3 w-3 text-blue-400 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

              </div>
            </div>

            {/* Right: explanatory text — 2/5 columns */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold">What It Detects</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  15 deterministic DAG rules run instantly. The AI analyzer uses Gemini for risk detection, guard bypass analysis, and semantic reasoning. New in this release: a full Google Prompt Engineering whitepaper audit — simplicity scoring, instruction/constraint ratio, missing examples detection, output format specificity grading, and prompting technique recommendations (CoT, ReAct, step-back, few-shot).
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {[
                  { text: 'Cognitive load score (0–100)', new: false },
                  { text: 'Simplicity score — sentence length, filler language, action verbs', new: true },
                  { text: 'Instruction vs. constraint ratio', new: true },
                  { text: 'Missing examples (few-shot / one-shot)', new: true },
                  { text: 'Vague or missing output format specification', new: true },
                  { text: 'Prompting technique detection & recommendations (CoT, ReAct, few-shot)', new: true },
                  { text: 'LLM-powered risk & permission detection', new: false },
                  { text: 'Guard bypass path analysis', new: false },
                  { text: 'Unguarded high-risk action warnings', new: false },
                  { text: 'Missing escalation paths', new: false },
                  { text: 'Numerical range gaps & overlaps', new: false },
                  { text: 'Orphaned / unreachable nodes', new: false },
                  { text: 'Circular dependencies & self-loops', new: false },
                  { text: 'Stale thresholds & outdated values', new: false },
                  { text: 'Contradictions with original prompt', new: false },
                ].map(({ text, new: isNew }) => (
                  <div key={text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span>{text}</span>
                    {isNew && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#C15F3C]/15 text-[#C15F3C] border border-[#C15F3C]/30">new</span>}
                  </div>
                ))}
              </div>

              {/* DAG Settings toggles */}
              <div className="rounded-xl border border-border bg-[#3C3936] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Wrench className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm font-semibold text-zinc-200">Settings &gt; Graph Rules</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {[
                    { label: 'Post-parse validation', desc: 'Validate immediately after AI generation', default_: 'ON' },
                    { label: 'Strict chat edit mode', desc: 'Reject edits that create critical DAG violations', default_: 'OFF' },
                    { label: 'Pre-flight runner check', desc: 'Validate before executing an agent', default_: 'OFF' },
                    { label: 'DAG-aware AI generation', desc: 'Inject DAG rules into AI prompts (~1.5-2x tokens)', default_: 'OFF' },
                  ].map(({ label, desc, default_ }) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-medium text-zinc-200">{label}</span>
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${default_ === 'ON'
                        ? 'text-green-400 bg-green-500/10 border border-green-500/30'
                        : 'text-zinc-500 bg-[#524F4C] border border-zinc-700'
                        }`}>
                        {default_}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-semibold text-green-400">Auto-fix</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  For fixable issues, the AI generates a precise graph mutation — adding missing edges, inserting guard nodes, or updating stale values — applied with one click.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── 9. SIMULATION STUDIO ── */}
      <section id="execution" className="py-24 md:py-32 px-4 bg-muted/20 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-500 mb-3 text-center">Simulation Studio</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Test Your Agent Before You Ship</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-14 text-center">
            A unified simulation environment with two modes, pre-flight validation, data flow tracking, and rich error reporting — all in a 3-column layout.
          </p>

          {/* Full-width mockup of the Simulation Studio */}
          <div className="rounded-xl border border-border bg-[#3C3936] shadow-[0_0_60px_rgba(6,182,212,0.07)] overflow-hidden mb-12">

            {/* Header bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[#484441]/80">
              <div>
                <div className="text-sm font-semibold text-zinc-200">Simulation Studio</div>
                <div className="text-[10px] text-zinc-500">Test your agent with sample inputs and visualize execution flow</div>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#524F4C] rounded-lg">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium text-zinc-400">
                  <Zap className="h-3 w-3" />
                  Preview
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium bg-[#484441] text-zinc-200 shadow-sm">
                  <Bot className="h-3 w-3" />
                  LLM Simulation
                </div>
              </div>
            </div>

            {/* Mode explanation badge */}
            <div className="px-5 py-1.5 border-b border-border bg-[#484441]/40">
              <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">
                Each executable node = 1 LLM call. Uses more tokens than Preview.
              </span>
            </div>

            {/* 3-column layout */}
            <div className="grid grid-cols-[220px_1fr_280px] min-h-[380px]">

              {/* ── Left: Input Panel ── */}
              <div className="border-r border-border p-3 flex flex-col gap-3">
                <div>
                  <div className="text-[10px] font-semibold text-zinc-400 mb-1.5">Test Input</div>
                  <div className="rounded-md border border-border bg-[#484441]/50 p-2 text-[11px] text-zinc-300 font-mono min-h-[60px]">
                    My invoice shows the wrong amount for February
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <div className="flex items-center gap-1 px-2 py-1 rounded border border-border text-[9px] text-zinc-400 bg-[#484441]/50">
                      <Sparkles className="h-2.5 w-2.5" /> Generate
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded border border-border text-[9px] text-zinc-400 bg-[#484441]/50">
                      Save
                    </div>
                  </div>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="text-[10px] font-semibold text-zinc-400 mb-1.5">Controls</div>
                  <div className="flex gap-1.5">
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-cyan-600 text-[10px] font-medium text-white">
                      <Play className="h-3 w-3" /> Run
                    </div>
                    <div className="flex items-center justify-center w-7 rounded border border-border bg-[#484441]/50">
                      <RotateCcw className="h-3 w-3 text-zinc-500" />
                    </div>
                  </div>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="text-[10px] font-semibold text-zinc-400 mb-1.5">Saved Test Cases</div>
                  <div className="rounded border border-border bg-[#484441]/30 p-2 text-[10px] text-zinc-500 text-center">
                    No saved test cases yet
                  </div>
                </div>
              </div>

              {/* ── Center: Step Timeline ── */}
              <div className="p-3 flex flex-col gap-2 overflow-hidden">
                {/* Error summary banner */}
                <div className="flex items-center gap-3 p-2 rounded-md bg-[#484441]/50 border border-border text-[10px]">
                  <span className="font-medium text-zinc-400">Pre-flight:</span>
                  <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> Structure OK</span>
                  <span className="text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> 1 warning</span>
                  <span className="mx-1 text-zinc-700">|</span>
                  <span className="font-medium text-zinc-400">Runtime:</span>
                  <span className="text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> 1 warning</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold text-zinc-400">Step Timeline</div>
                  <div className="text-[9px] text-zinc-500">5 step(s)</div>
                </div>

                {/* Step cards */}
                <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto pr-1">
                  {MOCK_SIM_STEPS.map((step, i) => {
                    const isSelected = i === 2;
                    const statusIcon = {
                      complete: <CheckCircle2 className="h-3 w-3 text-green-500" />,
                      passthrough: <CheckCircle2 className="h-3 w-3 text-green-500/50" />,
                      warning: <AlertTriangle className="h-3 w-3 text-yellow-500" />,
                      blocked: <ShieldAlert className="h-3 w-3 text-orange-500" />,
                    }[step.status] || <CheckCircle2 className="h-3 w-3 text-green-500" />;
                    const borderColor = {
                      complete: 'border-green-500/20',
                      passthrough: 'border-green-500/10',
                      warning: 'border-yellow-500/30 bg-yellow-500/5',
                    }[step.status] || 'border-green-500/20';

                    return (
                      <div
                        key={i}
                        className={`rounded-lg border px-2.5 py-2 ${borderColor} ${isSelected ? 'ring-1 ring-cyan-500/50 bg-cyan-500/5' : ''
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {statusIcon}
                            <span className="text-[9px] font-mono text-zinc-500">{i + 1}.</span>
                            <span className="text-[11px] font-medium text-zinc-200">{step.node}</span>
                          </div>
                          <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0 rounded border border-border text-zinc-500">{step.type}</span>
                        </div>
                        {step.pathTaken && (
                          <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1 pl-5">
                            <GitBranch className="h-2.5 w-2.5" />
                            Took: <span className="font-medium text-zinc-300">{step.pathTaken}</span>
                          </div>
                        )}
                        {step.status === 'warning' && (
                          <div className="text-[10px] text-yellow-500 mt-0.5 pl-5">{step.output}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Right: Data Inspector ── */}
              <div className="border-l border-border flex flex-col">
                <div className="px-3 py-2 border-b border-border">
                  <div className="text-[10px] font-semibold text-zinc-400">Data Inspector</div>
                </div>
                <div className="p-3 flex flex-col gap-2 text-[10px] overflow-y-auto flex-1">
                  {/* Step header */}
                  <div className="flex items-center gap-1.5 pb-2 border-b border-border">
                    <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0 rounded border border-border text-zinc-500">TASK</span>
                    <span className="text-[11px] font-medium text-zinc-200">Classify Intent</span>
                  </div>

                  {/* Input section */}
                  <div className="font-semibold text-zinc-400 flex items-center gap-1"><ChevronDown className="h-2.5 w-2.5" /> Input</div>
                  <div className="rounded bg-[#484441]/50 border border-border p-1.5">
                    <pre className="text-[9px] font-mono text-zinc-400 whitespace-pre-wrap">{MOCK_INSPECTOR.input}</pre>
                  </div>

                  {/* Output section */}
                  <div className="font-semibold text-zinc-400 flex items-center gap-1"><ChevronDown className="h-2.5 w-2.5" /> Output</div>
                  <div className="rounded bg-[#484441]/50 border border-border p-1.5">
                    <pre className="text-[9px] font-mono text-zinc-400 whitespace-pre-wrap">{MOCK_INSPECTOR.output}</pre>
                  </div>

                  {/* Data changes */}
                  <div className="font-semibold text-zinc-400 flex items-center gap-1">
                    <ChevronDown className="h-2.5 w-2.5" /> Data Changes
                    <span className="ml-auto text-[8px] bg-[#524F4C] px-1 rounded text-zinc-500">{MOCK_INSPECTOR.changes.length}</span>
                  </div>
                  <div className="rounded bg-[#484441]/50 border border-border p-1.5 space-y-0.5">
                    {MOCK_INSPECTOR.changes.map((c, i) => (
                      <div key={i} className="text-[9px] font-mono text-green-400 flex items-center gap-1">
                        <span>+</span>
                        <span className="font-semibold">{c.field}:</span>
                        <span>{c.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Conditions */}
                  <div className="font-semibold text-zinc-400 flex items-center gap-1">
                    <ChevronDown className="h-2.5 w-2.5" /> Conditions
                    <span className="ml-auto text-[8px] bg-zinc-800 px-1 rounded text-zinc-500">{MOCK_INSPECTOR.conditions.length}</span>
                  </div>
                  <div className="rounded bg-zinc-900/50 border border-border p-1.5 space-y-0.5">
                    {MOCK_INSPECTOR.conditions.map((c, i) => (
                      <div key={i} className="text-[9px] flex items-center gap-1">
                        {c.result
                          ? <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                          : <XCircle className="h-2.5 w-2.5 text-red-500/50" />}
                        <span className={c.result ? 'text-zinc-200 font-medium' : 'text-zinc-500'}>{c.condition}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Two-mode explanation cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">

            {/* Preview mode card */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Preview Mode</h3>
                  <p className="text-[10px] text-blue-400 font-medium">1 LLM call total</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Makes a single Gemini call to generate realistic sample data for every node in your graph, then walks through them instantly. Fast, cheap, and great for validating structure.
              </p>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Speed', value: 'Instant walkthrough after initial generation' },
                  { label: 'Cost', value: 'Low — one API call regardless of graph size' },
                  { label: 'Best for', value: 'Quick structure checks, path validation, cycle detection' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-2 text-xs">
                    <span className="font-semibold text-blue-400 shrink-0 w-14">{label}</span>
                    <span className="text-muted-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* LLM Simulation card */}
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-9 w-9 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold">LLM Simulation</h3>
                  <p className="text-[10px] text-yellow-400 font-medium">1 LLM call per executable node</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Runs your agent like real execution — each TASK, ACTION, DECISION, and GUARD node gets its own Gemini call. Produces realistic per-node outputs and real decision evaluations.
              </p>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Speed', value: 'Real-time, step by step with streaming' },
                  { label: 'Cost', value: 'Higher — token usage scales with node count' },
                  { label: 'Best for', value: 'End-to-end testing, realistic output validation' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-2 text-xs">
                    <span className="font-semibold text-yellow-400 shrink-0 w-14">{label}</span>
                    <span className="text-muted-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Feature bullets under the cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mt-8">
            {[
              { icon: Shield, label: 'Pre-flight checks', desc: 'Validates graph structure before running', color: 'text-green-400' },
              { icon: Activity, label: 'Data flow tracking', desc: 'See what changed at each step', color: 'text-cyan-400' },
              { icon: GitBranch, label: 'Path decisions', desc: 'Track which branches were taken and why', color: 'text-violet-400' },
              { icon: AlertTriangle, label: 'Error reporting', desc: 'Cause, message, and fix suggestion', color: 'text-yellow-400' },
            ].map(({ icon: Icon, label, desc, color }) => (
              <div key={label} className="text-center p-3 rounded-lg border border-border bg-card/30">
                <Icon className={`h-5 w-5 mx-auto mb-2 ${color}`} />
                <div className="text-xs font-semibold mb-0.5">{label}</div>
                <div className="text-[10px] text-muted-foreground leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 10. NODE TYPE SHOWCASE ── */}
      <section id="node-types" className="py-24 md:py-32 px-4 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3 text-center">Comprehensive Taxonomy</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">22 Node Types for Every Scenario</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12 text-center">
            Every part of an AI agent workflow has a purpose-built node — from personas and triggers to memory stores, safety guards, and logging outputs.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {Object.keys(NODE_COLORS).map((type) => (
              <div
                key={type}
                className="rounded-lg border border-border bg-card p-3 flex items-center gap-2.5"
                style={{ borderLeftWidth: 4, borderLeftColor: NODE_COLORS[type] }}
              >
                <span className="text-lg flex-shrink-0">{NODE_ICONS[type]}</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold leading-none mb-1" style={{ color: NODE_COLORS[type] }}>
                    {type}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight truncate">
                    {NODE_DESCRIPTIONS[type]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 11. TEMPLATES ── */}
      <section id="templates" className="py-24 md:py-32 px-4 bg-muted/20 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3 text-center">Quick Start</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Start From a Template</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12 text-center">
            Five pre-built agent templates get you to a working graph instantly — no prompt needed.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {TEMPLATES.map((template) => (
              <div key={template.name} className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
                <div className="text-3xl">{template.icon}</div>
                <div className="font-semibold text-sm">{template.name}</div>
                <div className="text-xs text-muted-foreground flex-1">{template.desc}</div>
                <div className="flex flex-wrap gap-1 mt-auto">
                  {template.nodes.map((nodeType) => (
                    <span
                      key={nodeType}
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: `${NODE_COLORS[nodeType]}20`,
                        color: NODE_COLORS[nodeType],
                        border: `1px solid ${NODE_COLORS[nodeType]}40`,
                      }}
                    >
                      {nodeType}
                    </span>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground">{template.nodeCount} nodes · ready to use</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 12. FEATURE GRID ── */}
      <section id="features" className="py-24 md:py-32 px-4 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3 text-center">Full Feature Set</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Everything You Need</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12 text-center">
            From first draft to production-ready agent — MAP covers the entire workflow.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, color, bg, title, desc }) => (
              <Card key={title} className="border-border/60 bg-card/50">
                <CardHeader>
                  <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{desc}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── 13. AI PROVIDERS STRIP ── */}
      <section className="py-16 px-4 border-y border-border/50">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C15F3C] mb-3">Multi-Provider AI</p>
          <h2 className="text-2xl font-bold mb-2">Works With Your AI Stack</h2>
          <p className="text-muted-foreground text-sm mb-8">Plug in your own API key for any supported provider. Default is Gemini 3 Flash.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {AI_PROVIDERS.map(({ name, dot, note }) => (
              <div
                key={name}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full border border-border bg-card text-sm font-medium"
              >
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
                <span>{name}</span>
                <span className="text-xs text-muted-foreground">— {note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 14. COMING SOON ── */}
      <section id="coming-soon" className="py-24 md:py-32 px-4 bg-muted/20 scroll-mt-14">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-3 text-center">In Development</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">Coming Soon</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12 text-center">
            Features currently in development. Expect rough edges and breaking changes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {WIP_FEATURES.map(({ icon: Icon, color, bg, title, desc, ...rest }) => {
              const href = (rest as { href?: string }).href;
              const inner = (
                <Card key={title} className={`border-border/60 bg-card/50${href ? ' hover:border-purple-500/40 transition-colors cursor-pointer' : ''}`}>
                  <CardHeader>
                    <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                      <Icon className={`h-5 w-5 ${color}`} />
                    </div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {title}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-400 font-semibold shrink-0">WIP</Badge>
                      {href && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
                    </CardTitle>
                    <CardDescription>{desc}</CardDescription>
                  </CardHeader>
                </Card>
              );
              return href ? <Link key={title} href={href} className="no-underline">{inner}</Link> : <span key={title}>{inner}</span>;
            })}
          </div>
        </div>
      </section>

      {/* ── 15. ENDING AREA (CTA + CONTACT) ── */}
      <div className="relative overflow-hidden border-t border-border/50">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(193,95,60,0.12),transparent)]" />

        {/* ── 15a. BOTTOM CTA ── */}
        <section className="relative py-32 px-4">
          <div className="relative z-10 max-w-3xl mx-auto text-center flex flex-col items-center">
            <div className="text-4xl mb-6">🚀</div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Generate a graph from your prompt in minutes.</h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-xl">
              Translate your prompt into a graph to truly understand what it&apos;s doing. Expose hidden errors, catch dangerous actions, and identify empty execution paths before they break your application.
            </p>
            <Button size="lg" className="h-14 px-10 text-base font-semibold shadow-xl shadow-[rgba(193,95,60,0.2)]" asChild>
              <Link href="/app">Open Agent Architect →</Link>
            </Button>
            <p className="text-xs text-muted-foreground mt-5">No account required · Runs entirely in your browser · Free to use</p>
          </div>
        </section>

        {/* ── 15b. CONTACT / SUPPORT ── */}
        <section id="contact" className="relative pb-32 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-6 border border-orange-500/20">
              <Mail className="h-6 w-6 text-orange-400" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Have Questions or Feature Ideas?</h2>
            <p className="text-lg text-muted-foreground mb-8 text-balance">
              I&apos;m constantly improving MAP Agent Architect. If you encounter any issues, have suggestions for new features, or just want to chat about agent design, feel free to reach out.
            </p>
            <a
              href="mailto:project.MAP@proton.me"
              className="text-2xl md:text-3xl font-bold text-[#C15F3C] hover:text-orange-400 transition-colors underline underline-offset-8 decoration-orange-500/20 hover:decoration-[#C15F3C]"
            >
              project.MAP@proton.me
            </a>
          </div>
        </section>
      </div>

      {/* ── 16. FOOTER ── */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-4 w-4" width="16" height="16" />
            MAP Agent Architect
          </div>
          <p className="text-xs text-muted-foreground">
            Built with Next.js 16 · React Flow · Gemini 3 Flash · Tailwind CSS
          </p>
          <Link href="/app" className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4">
            Open App →
          </Link>
        </div>
      </footer>

    </div>
  )
}

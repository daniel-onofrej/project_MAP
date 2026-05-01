import { H2, H3, P, Lead, Strong, RelatedLinks } from '@/components/wiki/prose'
import { NodeTypeCard } from '@/components/wiki/mockups'
import { NODE_ICONS } from '@/lib/wiki/data'

export const toc = [
  { id: 'taxonomy', label: 'Taxonomy', level: 2 as const },
  { id: 'control-flow', label: 'Control flow', level: 2 as const },
  { id: 'behavior', label: 'Behavior', level: 2 as const },
  { id: 'integration', label: 'Integration', level: 2 as const },
  { id: 'structural', label: 'Structural', level: 2 as const },
]

type NodeDetail = {
  whenToUse: string
  example: string
  commonConnections: string[]
  riskCategory?: string
}

const DETAILS: Record<string, NodeDetail> = {
  START: { whenToUse: 'Every graph needs one; it is the single entry point.', example: 'User sends a message', commonConnections: ['→ TASK', '→ DECISION', '→ PERSONA'] },
  END: { whenToUse: 'Any terminal path. Use multiple ENDs for distinct exit outcomes.', example: 'Ticket resolved', commonConnections: ['← LOGGING', '← ACTION'] },
  DECISION: { whenToUse: 'Branch on a categorical value (intent, status, user tier).', example: 'Intent is billing, technical, or general', commonConnections: ['→ TASK (per branch)', '→ HANDOFF (fallback)'] },
  OPTION: { whenToUse: 'One branch of a DECISION. Grouped under its parent DECISION node.', example: '"billing" branch', commonConnections: ['← DECISION', '→ TASK'] },
  CONDITION: { whenToUse: 'Boolean check, typically used for retry loops or early returns.', example: 'Retry count < 3', commonConnections: ['← CONFIG', '→ TOOL', '→ END'] },
  LOOP: { whenToUse: 'Explicit iteration. Pair with CONDITION to bound the loop.', example: 'For each item in batch', commonConnections: ['→ TASK', '→ CONDITION'] },
  TASK: { whenToUse: 'A unit of cognitive work the agent performs. Most common node.', example: 'Classify the user intent', commonConnections: ['→ DECISION', '→ ACTION'] },
  STEP: { whenToUse: 'A deterministic sequential step. Lighter than TASK; used when no reasoning is involved.', example: 'Format the response', commonConnections: ['→ STEP', '→ END'] },
  RULE: { whenToUse: 'A policy or business logic constraint attached to an action.', example: 'Refunds must be under $500', commonConnections: ['→ ACTION', '→ GUARD'] },
  PERSONA: { whenToUse: 'Defines the agent\'s voice, tone, and identity. One per graph.', example: 'Empathetic support agent', commonConnections: ['→ START', '→ TASK'] },
  GUARD: { whenToUse: 'Safety filter before a risky action. Key to Actions & Permissions.', example: 'Verify user is authenticated', commonConnections: ['→ ACTION', '→ TOOL'], riskCategory: 'Auth & Permissions' },
  ACTION: { whenToUse: 'A side-effecting operation in the real world.', example: 'Issue a refund', commonConnections: ['← GUARD', '→ LOGGING'], riskCategory: 'Financial, System, Communication' },
  TOOL: { whenToUse: 'Call to an external API or function. Always has a known interface.', example: 'call billing_api.getAccount', commonConnections: ['← GUARD', '→ MEMORY'], riskCategory: 'API & Integrations' },
  MEMORY: { whenToUse: 'Read or write to a persistence store.', example: 'Save conversation summary', commonConnections: ['← TASK', '→ END'], riskCategory: 'Data & Storage' },
  CONFIG: { whenToUse: 'Tunable parameters (thresholds, timeouts, model names).', example: 'retry_max=3, timeout=30s', commonConnections: ['→ CONDITION', '→ TOOL'] },
  REFERENCE: { whenToUse: 'Pointer to external doc or knowledge source.', example: 'See refund policy v2', commonConnections: ['→ RULE', '→ TASK'] },
  HANDOFF: { whenToUse: 'Delegate to a human or another agent.', example: 'Escalate to human supervisor', commonConnections: ['← DECISION', '→ END'] },
  TRIGGER: { whenToUse: 'External event that starts execution (webhook, schedule, signal).', example: 'On new support email', commonConnections: ['→ START'] },
  RESOLUTION: { whenToUse: 'Terminal outcome handler, distinct from END for complex agents.', example: 'Refund issued, case closed', commonConnections: ['← ACTION', '→ LOGGING'] },
  LOGGING: { whenToUse: 'Emit an audit trail or telemetry event.', example: 'Log resolution for compliance', commonConnections: ['← ACTION', '→ END'], riskCategory: 'Logging & Audit' },
  INPUT: { whenToUse: 'Data or user input expected at runtime.', example: 'User message', commonConnections: ['→ TASK'] },
  GROUP: { whenToUse: 'Visual container grouping related nodes. Does not affect execution.', example: 'All billing-related nodes', commonConnections: ['(contains nodes)'] },
}

export default function NodeTypesReference() {
  const ids = Object.keys(NODE_ICONS)
  const controlFlow = ['START', 'END', 'DECISION', 'OPTION', 'CONDITION', 'LOOP']
  const behavior = ['TASK', 'STEP', 'RULE', 'PERSONA', 'GUARD', 'ACTION']
  const integration = ['TOOL', 'MEMORY', 'CONFIG', 'REFERENCE', 'HANDOFF', 'TRIGGER']
  const structural = ['RESOLUTION', 'LOGGING', 'INPUT', 'GROUP']

  const renderGrid = (list: string[]) => (
    <div className="grid gap-2 sm:grid-cols-2 mb-8">
      {list.filter((t) => ids.includes(t)).map((t) => (
        <NodeTypeCard key={t} type={t} detail={DETAILS[t] ?? { whenToUse: '—', example: '—', commonConnections: [] }} />
      ))}
    </div>
  )

  return (
    <>
      <Lead>
        MAP has {ids.length} node types, each representing a different kind of agent
        behavior. This reference groups them into four families by role — control flow,
        behavior, integration, and structural — and each card expands on click to show
        when to use the type, an example label, its common connections, and its associated
        risk category if any.
      </Lead>

      <H2 id="taxonomy">Taxonomy</H2>
      <P>
        Types cluster into four families. Every node you&apos;ll see in a graph belongs to
        one of them:
      </P>
      <ul className="list-disc pl-6 space-y-1 text-[15px] leading-7 text-foreground/85 mb-6 marker:text-muted-foreground/60">
        <li><Strong>Control flow</Strong> — how the agent&apos;s execution branches and terminates.</li>
        <li><Strong>Behavior</Strong> — what the agent thinks about or does at each step.</li>
        <li><Strong>Integration</Strong> — how the agent connects to external systems.</li>
        <li><Strong>Structural</Strong> — logging, I/O, and visual grouping.</li>
      </ul>

      <H2 id="control-flow">Control flow</H2>
      <P>
        These types define <Strong>when</Strong> things happen, not <Strong>what</Strong>{' '}
        happens. Every graph starts with a <code>START</code> and ends with one or more{' '}
        <code>END</code> nodes; between them, DECISION and CONDITION shape the path.
      </P>
      {renderGrid(controlFlow)}

      <H2 id="behavior">Behavior</H2>
      <P>
        The agent&apos;s cognitive work lives here. TASK and STEP carry the reasoning;
        RULE, GUARD, and PERSONA shape it; ACTION produces a side effect.
      </P>
      {renderGrid(behavior)}

      <H2 id="integration">Integration</H2>
      <P>
        These types connect the agent to the outside world — tools, memory, external
        triggers, configuration, documentation references, and human handoffs.
      </P>
      {renderGrid(integration)}

      <H2 id="structural">Structural</H2>
      <P>
        Supporting types: explicit input declarations, audit emission, multi-outcome
        terminal markers, and visual grouping.
      </P>
      {renderGrid(structural)}

      <RelatedLinks
        slugs={[
          'reference/permissions-and-roles',
          'learn/editing-nodes-and-edges',
          'concepts/risk-categories',
        ]}
      />
    </>
  )
}

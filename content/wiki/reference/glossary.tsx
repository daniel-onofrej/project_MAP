import { H2, P, Lead, Strong, A, InlineCode, RelatedLinks } from '@/components/wiki/prose'

export const toc = [
  { id: 'terms', label: 'Terms', level: 2 as const },
]

type Term = { name: string; def: React.ReactNode }

const TERMS: Term[] = [
  { name: 'Agent', def: <>A configured prompt graph that, taken as a whole, produces a specific behavior. In MAP an agent is a named graph plus its version history.</> },
  { name: 'Conflict', def: <>An edge or node state the DAG validator cannot resolve — typically a cycle, a self-loop, or a decision branch that never reaches an end.</> },
  { name: 'DAG', def: <>Directed acyclic graph. MAP graphs are DAGs; the validator rejects cycles.</> },
  { name: 'Edge', def: <>A directed connection from one node to another, representing flow of control.</> },
  { name: 'Gemini', def: <>Google&apos;s model family, used as MAP&apos;s default generation provider. See <A href="/wiki/reference/ai-providers">AI Providers</A>.</> },
  { name: 'Graph', def: <>The visual, editable representation of a prompt. Nodes are behavior; edges are control flow.</> },
  { name: 'Guarded', def: <>An action node is Guarded when at least one <InlineCode>GUARD</InlineCode> exists within three hops upstream on any path that reaches it.</> },
  { name: 'Handle', def: <>The attachment point on a node where an edge begins or ends. Each node has a single input handle and one or more outputs.</> },
  { name: 'MCP', def: <>Model Context Protocol — the open standard MAP uses to expose graphs as tools for external clients like Claude Desktop.</> },
  { name: 'Node', def: <>A single step in a graph. Typed (<InlineCode>TASK</InlineCode>, <InlineCode>DECISION</InlineCode>, <InlineCode>GUARD</InlineCode>, etc.) and labeled with a description.</> },
  { name: 'PFG', def: <>Prompt-Flow-Graph. The internal skill that translates between prompts and graphs; also the name of the JSON schema MAP serializes to.</> },
  { name: 'Persona', def: <>A node type that defines the agent&apos;s voice, tone, and identity. One per graph.</> },
  { name: 'Re-sync', def: <>Deterministically reconstruct a prompt from the current graph and compare it to the original. Produces a similarity score.</> },
  { name: 'Rule', def: <>A constraint or policy attached to an action — e.g. &ldquo;refunds must be under $500&rdquo;.</> },
  { name: 'Similarity score', def: <>A 0–100 value expressing how closely the reconstructed prompt matches the original. Scores above 90 are typical after light editing.</> },
  { name: 'Template', def: <>A pre-shaped starter graph you can apply and customize. See <A href="/wiki/reference/templates">Templates catalog</A>.</> },
  { name: 'Version', def: <>A saved snapshot of a graph. Versions are immutable; rollback creates a new version rather than mutating history.</> },
  { name: 'Workspace', def: <>The top-level container for agents, keys, and members. Each user has a personal workspace and can be invited into shared group workspaces.</> },
]

export default function GlossaryReference() {
  const sorted = [...TERMS].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <Lead>
        Every MAP-specific term, defined in one place. If you see an unfamiliar word in
        another wiki page, it is almost certainly defined here.
      </Lead>

      <H2 id="terms">Terms</H2>
      <dl className="mt-4 space-y-5 max-w-[70ch]">
        {sorted.map((t) => (
          <div key={t.name} className="border-l-2 border-border/50 pl-4">
            <dt className="text-sm font-semibold mb-1">
              <Strong>{t.name}</Strong>
            </dt>
            <dd className="text-[14.5px] leading-7 text-foreground/85">{t.def}</dd>
          </div>
        ))}
      </dl>

      <RelatedLinks
        slugs={[
          'reference/node-types',
          'concepts/prompt-graph-sync',
          'learn/welcome',
        ]}
      />
    </>
  )
}

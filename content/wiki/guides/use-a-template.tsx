import { H2, P, Lead, Strong, A, InlineCode, RelatedLinks } from '@/components/wiki/prose'
import { Callout, Steps, Step } from '@/components/wiki/prose-client'
import { TEMPLATES, NODE_COLORS } from '@/lib/wiki/data'

export const toc = [
  { id: 'why', label: 'Why start from a template', level: 2 as const },
  { id: 'catalog', label: 'The built-in catalog', level: 2 as const },
  { id: 'apply', label: 'Applying a template', level: 2 as const },
  { id: 'customize', label: 'Customizing the result', level: 2 as const },
]

export default function UseATemplate() {
  return (
    <>
      <Lead>
        Templates are pre-built graphs for common agent patterns — customer support,
        content moderation, data pipelines. They&apos;re not opinionated about your domain;
        they&apos;re opinionated about <em>structure</em>. Starting from one saves the
        hour of deciding where guards go and what the fallback branches look like.
      </Lead>

      <H2 id="why">Why start from a template</H2>
      <P>
        Most real agents share a small number of structural patterns: classify-then-route,
        validate-then-act, multi-agent-orchestration. A good template encodes the structure
        without prescribing the labels. You pick a template, then fill in the specifics for
        your workflow — the shape is already correct.
      </P>

      <H2 id="catalog">The built-in catalog</H2>
      <P>
        MAP currently ships {TEMPLATES.length} templates. Each appears in the{' '}
        <Strong>Templates</Strong> panel (toolbar → Templates) with a preview of the node
        composition. See the{' '}
        <A href="/wiki/reference/templates">Templates catalog reference</A> for every
        template with its full node breakdown.
      </P>
      <div className="grid gap-3 sm:grid-cols-2 my-6">
        {TEMPLATES.map((t) => (
          <div
            key={t.name}
            className="rounded-lg border border-border/40 bg-card/30 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{t.icon}</span>
              <p className="text-sm font-semibold">{t.name}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">{t.desc}</p>
            <div className="flex flex-wrap gap-1">
              {t.nodes.map((n) => (
                <span
                  key={n}
                  className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{
                    backgroundColor: (NODE_COLORS[n] ?? '#555') + '22',
                    color: NODE_COLORS[n] ?? '#aaa',
                  }}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <H2 id="apply">Applying a template</H2>
      <Steps>
        <Step n={1} title="Open the Templates panel">
          <P>
            From the toolbar, click <Strong>Templates</Strong>. A dialog lists every
            available template with a thumbnail and a short description.
          </P>
        </Step>
        <Step n={2} title="Preview before applying">
          <P>
            Hover a template to see the full node layout. MAP shows which node types are
            included and the rough edge topology without committing yet.
          </P>
        </Step>
        <Step n={3} title="Apply to a fresh graph">
          <P>
            Click <Strong>Use this template</Strong>. MAP creates a new graph in your
            active workspace with the template&apos;s structure. All labels are generic
            placeholders — your job is to rename them to fit your use case.
          </P>
        </Step>
      </Steps>

      <Callout type="tip">
        Templates never overwrite an existing graph. They always create a new one. If you
        want to merge a template&apos;s pattern into an existing graph, open both and
        copy-paste the subgraph — selection supports multi-node copy.
      </Callout>

      <H2 id="customize">Customizing the result</H2>
      <P>
        After applying a template, the usual customization steps are: rename every node to
        match your domain (<InlineCode>Intent Decision</InlineCode> →{' '}
        <InlineCode>Ticket Type</InlineCode>), delete any nodes you don&apos;t need,
        connect any external tools or memory stores you have (drag a{' '}
        <InlineCode>TOOL</InlineCode> node onto the canvas and reference it from the
        appropriate action), and tighten the guards to your policy.
      </P>
      <P>
        Once the graph looks right, run <Strong>Re-sync</Strong>. The reconstructed prompt
        is a clean first draft you can ship immediately or refine further. Save it as a
        named version — <InlineCode>baseline</InlineCode> is a good name — so you can
        always diff future changes against the template&apos;s structure.
      </P>

      <RelatedLinks
        slugs={[
          'reference/templates',
          'learn/build-your-first-graph',
          'reference/node-types',
        ]}
      />
    </>
  )
}

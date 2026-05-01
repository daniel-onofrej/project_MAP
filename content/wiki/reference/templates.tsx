import { H2, P, Lead, Strong, NodeBadge, RelatedLinks } from '@/components/wiki/prose'
import { TEMPLATES } from '@/lib/wiki/data'

export const toc = [
  { id: 'catalog', label: 'Template catalog', level: 2 as const },
  { id: 'anatomy', label: 'Anatomy of a template', level: 2 as const },
  { id: 'customizing', label: 'Customizing after apply', level: 2 as const },
]

export default function TemplatesReference() {
  return (
    <>
      <Lead>
        Templates are small, well-shaped starter graphs for common agent patterns. Each one
        is a complete, runnable graph you can apply and then customize — the goal is to
        give you a sensible starting point, not a final architecture.
      </Lead>

      <H2 id="catalog">Template catalog</H2>
      <P>
        MAP ships with {TEMPLATES.length} built-in templates. Each lists its headline node
        types — the ones that carry the behavior. Every template also includes a{' '}
        <NodeBadge type="START" /> and one or more <NodeBadge type="END" /> nodes.
      </P>

      <div className="grid gap-4 sm:grid-cols-2 my-6">
        {TEMPLATES.map((t) => (
          <div
            key={t.name}
            className="rounded-lg border border-border/50 bg-card/40 p-5 hover:border-border transition-colors"
          >
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">{t.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.nodeCount} nodes
                </p>
              </div>
            </div>
            <p className="text-[13px] leading-6 text-foreground/80 mb-3">{t.desc}</p>
            <div className="flex flex-wrap gap-1.5">
              {t.nodes.map((n) => (
                <NodeBadge key={n} type={n} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <H2 id="anatomy">Anatomy of a template</H2>
      <P>
        Every template follows the same structure: an explicit entry point, one or two
        branches of behavior, guards on any risky action, and clearly-labeled terminal
        nodes. This structure is not required by the engine — it&apos;s the structure the
        maintainers have found tends to produce graphs that reconstruct cleanly into
        prompts and read well in review.
      </P>
      <P>
        A template is <Strong>not</Strong> a black box. After you apply it, the full graph
        is editable — add new branches, rename nodes, delete what you don&apos;t need.
        MAP will not try to reconcile your edits against the original template.
      </P>

      <H2 id="customizing">Customizing after apply</H2>
      <P>
        The most common first customization is replacing placeholder labels with your
        domain language — &ldquo;classify intent&rdquo; becomes &ldquo;classify as billing,
        technical, or account&rdquo;. Re-sync after that edit and confirm the reconstructed
        prompt reads naturally; if it doesn&apos;t, the label change probably needs to be
        more specific.
      </P>
      <P>
        The second most common change is adding a <NodeBadge type="GUARD" /> before an
        action that shouldn&apos;t run without checks — payment flows, any write to memory,
        any outbound communication.
      </P>

      <RelatedLinks
        slugs={[
          'guides/use-a-template',
          'reference/node-types',
          'guides/audit-risky-actions',
        ]}
      />
    </>
  )
}

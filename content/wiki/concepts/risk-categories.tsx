import { H2, P, Lead, Strong, NodeBadge, InlineCode, RelatedLinks } from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'why', label: 'Why classify at all', level: 2 as const },
  { id: 'how', label: 'How detection works', level: 2 as const },
  { id: 'limits', label: 'Limits of the approach', level: 2 as const },
  { id: 'guidance', label: 'How to use the output', level: 2 as const },
]

export default function RiskCategoriesConcept() {
  return (
    <>
      <Lead>
        MAP classifies every action node into one of eight risk categories. This page
        explains the motivation, how the classifier works under the hood, and the
        failure modes you should be aware of when you rely on it.
      </Lead>

      <H2 id="why">Why classify at all</H2>
      <P>
        The behavior of an agent is easier to review than to specify. A reviewer skimming
        a 40-node graph can&apos;t hold every possible unsafe path in their head. Risk
        categorization is a shortcut: <Strong>show me everything that can spend money,
        touch a database, or email a customer — regardless of how it&apos;s named.</Strong>
      </P>
      <P>
        The categories are not novel; they mirror the taxonomy most security-review
        checklists already use. MAP&apos;s contribution is applying them automatically
        to every action in the graph and surfacing the result in the editor.
      </P>

      <H2 id="how">How detection works</H2>
      <P>
        Detection is heuristic, not learned. The classifier in{' '}
        <InlineCode>lib/capability-analyzer.ts</InlineCode> scans each{' '}
        <NodeBadge type="ACTION" />, <NodeBadge type="TOOL" />, and{' '}
        <NodeBadge type="MEMORY" /> node for keywords and regex patterns — &ldquo;refund,
        charge, payment&rdquo; map to Financial; &ldquo;deploy, exec, kill&rdquo; map to
        System &amp; Infrastructure; and so on. When multiple categories match, the highest-
        severity wins.
      </P>
      <P>
        Guard detection is structural. MAP walks the graph backward from the action up
        to three hops and checks whether any <NodeBadge type="GUARD" /> lies on every path
        back to <InlineCode>START</InlineCode>. If yes, the action is Guarded.
      </P>

      <H2 id="limits">Limits of the approach</H2>
      <Callout type="warning">
        Because detection is keyword-driven, it over-fires and under-fires. A node labeled
        &ldquo;Retrieve account balance&rdquo; is classified as Financial even though it
        only reads. A node labeled <InlineCode>xxx_action_7</InlineCode> evades the
        classifier entirely. The Actions &amp; Permissions panel is a prompt for review,
        not a proof.
      </Callout>
      <P>
        Guard-detection is also structural, not semantic. A <NodeBadge type="GUARD" /> node
        labeled &ldquo;always true&rdquo; still counts as protection from MAP&apos;s
        point of view. Guards should name the <em>policy</em> they enforce
        (&ldquo;Refund ≤ $500&rdquo;, &ldquo;User is authenticated&rdquo;) — that makes
        review meaningful.
      </P>

      <H2 id="guidance">How to use the output</H2>
      <P>
        Treat the panel as a to-do list for the reviewer: the red Unguarded rows are where
        a human should read the action and decide whether a guard is missing or the label
        just looks scary. Don&apos;t chase a green panel — a clean panel is necessary but
        not sufficient for a safe agent.
      </P>

      <RelatedLinks
        slugs={[
          'reference/permissions-and-roles',
          'guides/audit-risky-actions',
          'reference/node-types',
        ]}
      />
    </>
  )
}

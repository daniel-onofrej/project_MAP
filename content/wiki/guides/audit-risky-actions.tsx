import {
  H2,
  P,
  UL,
  LI,
  Lead,
  Strong,
  A,
  InlineCode,
  NodeBadge,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'panel', label: 'The Actions & Permissions panel', level: 2 as const },
  { id: 'filtering', label: 'Filtering by category and risk', level: 2 as const },
  { id: 'resolving', label: 'Resolving unguarded actions', level: 2 as const },
  { id: 'dismissing', label: 'When to dismiss a warning', level: 2 as const },
]

export default function AuditRiskyActions() {
  return (
    <>
      <Lead>
        MAP classifies every action node into one of eight risk categories and tells you
        whether it&apos;s guarded. The Actions &amp; Permissions panel is where you audit
        this surface. This guide explains how to read the panel, filter it, and close out
        the warnings it raises.
      </Lead>

      <H2 id="panel">The Actions &amp; Permissions panel</H2>
      <P>
        Open the panel from the right sidebar. It lists every node in the current graph
        that performs a real-world action — anything typed <NodeBadge type="ACTION" />,{' '}
        <NodeBadge type="TOOL" />, <NodeBadge type="HANDOFF" />, or{' '}
        <NodeBadge type="MEMORY" />. Each row shows the node label, its detected risk
        category, its risk level (high/medium/low), and a colored badge indicating whether
        a <NodeBadge type="GUARD" /> is present within three hops upstream.
      </P>
      <P>
        A <Strong className="text-emerald-400">green Guarded</Strong> badge means a guard
        is upstream. A <Strong className="text-muted-foreground">grey Unguarded</Strong>{' '}
        badge means nothing protects this action. A{' '}
        <Strong className="text-red-400">red Unguarded</Strong> badge means the action is
        high-risk <em>and</em> unprotected — that&apos;s the row you want to fix first.
      </P>

      <H2 id="filtering">Filtering by category and risk</H2>
      <P>
        The filter bar at the top of the panel has two controls: a category dropdown (all
        eight categories plus &ldquo;any&rdquo;) and a risk-level toggle. Common filter
        combinations:
      </P>
      <UL>
        <LI>
          <Strong>Category: Financial, risk: high</Strong> — payments, refunds, billing
          adjustments. This is almost always the most important category to audit.
        </LI>
        <LI>
          <Strong>Category: System &amp; Infrastructure, risk: high</Strong> — shell
          commands, deploys, server mutations. Should be Guarded in every serious agent.
        </LI>
        <LI>
          <Strong>Category: User Communication, risk: any</Strong> — emails, SMS, Slack
          messages. Medium-risk categories often escape scrutiny; filter here to catch
          them.
        </LI>
      </UL>

      <H2 id="resolving">Resolving unguarded actions</H2>
      <P>
        Each unguarded action has a{' '}
        <Strong>Suggest fix</Strong> button. Clicking it highlights the action on the
        canvas and proposes the smallest graph edit that would make it Guarded — usually
        inserting a <NodeBadge type="GUARD" /> node immediately upstream with a label
        describing the policy it enforces.
      </P>
      <P>
        You can accept the suggestion, accept it and edit the guard&apos;s label, or
        decline. Declining doesn&apos;t dismiss the warning — the row stays in the panel
        until the structure actually changes.
      </P>

      <Callout type="tip">
        Guards are most effective when their labels name the <em>policy</em>, not the
        action. <InlineCode>Refund policy &le; $500</InlineCode> is clearer than{' '}
        <InlineCode>Check amount</InlineCode>. The re-sync will surface the policy in the
        reconstructed prompt, making it reviewable.
      </Callout>

      <H2 id="dismissing">When to dismiss a warning</H2>
      <P>
        Some actions are intentionally unguarded — a simple read, a non-destructive API
        probe, a logging emission. For these, click <Strong>Dismiss</Strong> with a short
        reason. The dismissal is stored with the graph (not globally), so a future
        reviewer can see why the warning was acknowledged without anyone adding a guard.
      </P>
      <P>
        Dismissed warnings still appear in the panel under a collapsed <em>Dismissed</em>{' '}
        section. They never re-appear unless the graph structure around them changes, at
        which point MAP re-evaluates and may promote them back to the active list.
      </P>

      <RelatedLinks
        slugs={[
          'concepts/risk-categories',
          'reference/permissions-and-roles',
          'learn/editing-nodes-and-edges',
        ]}
      />
    </>
  )
}

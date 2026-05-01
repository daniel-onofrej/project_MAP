import { H2, P, Lead, Strong, InlineCode, RelatedLinks } from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'
import { SyncDiagramMock } from '@/components/wiki/mockups'

export const toc = [
  { id: 'why', label: 'Why bidirectional sync', level: 2 as const },
  { id: 'reconstruction', label: 'How reconstruction works', level: 2 as const },
  { id: 'similarity', label: 'The similarity score', level: 2 as const },
  { id: 'when-to-trust', label: 'When to trust which side', level: 2 as const },
]

export default function PromptGraphSyncConcept() {
  return (
    <>
      <Lead>
        A prompt and a graph are two views of the same object. MAP keeps both
        views editable and round-trippable — you can edit either side, and the other
        side re-derives cleanly. This page explains why that property matters and how
        it&apos;s achieved.
      </Lead>

      <SyncDiagramMock />

      <H2 id="why">Why bidirectional sync</H2>
      <P>
        A prompt is great for <Strong>authoring</Strong> — you think in sentences. A graph
        is great for <Strong>reviewing</Strong> — you see structure, branches, and gaps at
        a glance. Tools that only convert one way force you to pick a primary representation
        and treat the other as disposable. MAP treats both as authoritative: edit prose
        when you&apos;re iterating on wording, edit the graph when you&apos;re iterating on
        structure.
      </P>
      <P>
        The round-trip is lossless for the shapes MAP models — nodes, edges, rules,
        guards, and the metadata attached to each. It is <em>not</em> lossless for every
        quirk of free-form prose; ASCII art, tables, and idiosyncratic formatting
        won&apos;t survive a full round-trip.
      </P>

      <H2 id="reconstruction">How reconstruction works</H2>
      <P>
        Graph → prompt reconstruction is <Strong>deterministic</Strong> — the same graph
        always produces the same prompt, with no LLM call in the loop. The algorithm walks
        the graph from <InlineCode>START</InlineCode> in topological order, emitting a
        section per node with a template keyed to the node&apos;s type.
      </P>
      <P>
        Prompt → graph generation is <Strong>not</Strong> deterministic — it&apos;s a
        Gemini call with a structured schema. Two generations of the same prompt may
        differ in node labels, layout, or branch counts. This is expected; once the graph
        exists, the deterministic reverse direction keeps things stable.
      </P>

      <H2 id="similarity">The similarity score</H2>
      <P>
        When you re-sync, MAP computes a similarity score (0–100) comparing the
        reconstructed prompt against the original. The score is a normalized edit distance
        at the sentence level, weighted so that reordering sections costs less than
        changing meaning.
      </P>
      <Callout type="note">
        A score in the 90s is the usual zone for a graph that has been lightly edited. A
        drop to the 70s signals meaningful structural change — either you&apos;ve added
        real behavior the prompt didn&apos;t describe, or the reconstruction has diverged
        and a direction-choice is due.
      </Callout>

      <H2 id="when-to-trust">When to trust which side</H2>
      <P>
        When the score is high: both representations agree; either is a safe source of
        truth. When the score is low: you have a decision to make. If the graph is
        <Strong>ahead</Strong> of the prompt — you&apos;ve been editing visually and the
        original prose is stale — accept the reconstruction. If the prompt is ahead —
        you&apos;ve edited prose directly and the graph hasn&apos;t kept up — regenerate
        the graph from the prompt.
      </P>
      <P>
        MAP deliberately does not auto-pick. Choosing a direction is a judgment call
        about which view you trust more for <em>this specific change</em>, and the tool
        surfaces the information rather than forcing a reconciliation.
      </P>

      <RelatedLinks
        slugs={[
          'guides/convert-graph-to-prompt',
          'learn/build-your-first-graph',
          'reference/glossary',
        ]}
      />
    </>
  )
}

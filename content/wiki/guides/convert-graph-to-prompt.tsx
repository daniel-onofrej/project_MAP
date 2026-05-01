import {
  H2,
  P,
  UL,
  LI,
  Lead,
  Strong,
  InlineCode,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'
import { SyncDiagramMock } from '@/components/wiki/mockups'

export const toc = [
  { id: 'how', label: 'How the conversion works', level: 2 as const },
  { id: 'similarity', label: 'Reading the similarity score', level: 2 as const },
  { id: 'when-to-trust', label: 'When to trust which side', level: 2 as const },
  { id: 'workflow', label: 'A recommended workflow', level: 2 as const },
]

export default function ConvertGraphToPrompt() {
  return (
    <>
      <Lead>
        Every graph in MAP can be converted back into a clean system prompt. The
        conversion is deterministic — no LLM in the loop — and it produces the same output
        for the same input every time. This guide explains what the conversion does, how
        to interpret the similarity score it gives you, and when to re-sync on purpose.
      </Lead>

      <H2 id="how">How the conversion works</H2>
      <P>
        Click <Strong>Re-sync</Strong> in the toolbar to kick off the conversion. MAP
        walks the graph in topological order, emits a preamble from any{' '}
        <InlineCode>PERSONA</InlineCode> nodes, then renders each reachable node as a
        numbered clause in the prompt. Rules attach to the actions they guard; decisions
        become &ldquo;if … then …&rdquo; constructions; loops and conditions become
        explicit retry clauses.
      </P>
      <P>
        Because the conversion is rule-based, you can predict what it will produce. The
        same graph always yields the same prompt, which is what makes it safe to use in a
        review workflow — you can diff before and after a graph edit and see the exact
        prompt delta.
      </P>

      <SyncDiagramMock />

      <H2 id="similarity">Reading the similarity score</H2>
      <P>
        The similarity score sits above the side-by-side panel after a re-sync. It&apos;s a
        word-level comparison between the prompt the graph was originally generated from
        and the prompt MAP just reconstructed. The number means exactly one thing: how
        much of the wording overlaps.
      </P>
      <UL>
        <LI>
          <Strong>85–100</Strong> — the two representations are in sync. Any wording
          difference is rephrasing, not structural drift. Safe to ignore.
        </LI>
        <LI>
          <Strong>70–85</Strong> — there&apos;s meaningful drift. Usually caused by an edit
          on the graph that added structure the original prompt didn&apos;t have. Read the
          diff and decide whether to keep the graph version (treat it as the new source of
          truth) or to hand-edit the prompt back.
        </LI>
        <LI>
          <Strong>Below 70</Strong> — something substantial has changed on one side. Either
          you&apos;ve restructured the graph significantly, or the original prompt was
          noisy and the graph simplified it. Read both in full before picking one.
        </LI>
      </UL>

      <Callout type="note">
        A low similarity score is not a failure. It&apos;s a measurement. Many high-quality
        graphs have scores in the mid-70s because MAP&apos;s reconstruction is tighter
        than the hand-written original — fewer filler words, more explicit branching.
      </Callout>

      <H2 id="when-to-trust">When to trust which side</H2>
      <P>
        Rule of thumb: trust the graph for <em>structure</em>, trust the prompt for{' '}
        <em>wording</em>. If the graph shows a branch the original prompt was ambiguous
        about, the graph is right and you should overwrite the original prompt with the
        reconstructed one. If the reconstructed prompt uses bland phrasing in a place where
        your original had nuance, keep the original prompt — the graph will still execute
        correctly, and the re-sync score reflects stylistic difference, not behavioral.
      </P>

      <H2 id="workflow">A recommended workflow</H2>
      <P>
        Teams that adopt MAP as their source of truth for agent prompts tend to land on
        roughly this loop:
      </P>
      <UL>
        <LI>
          Generate the initial graph from the best-known prompt.
        </LI>
        <LI>
          Re-sync immediately — if the score is high, great; if low, decide which side to
          align to and commit once.
        </LI>
        <LI>
          From then on, edit the <em>graph</em> when logic changes, and the{' '}
          <em>prompt</em> when only wording changes. Re-sync after each direction; keep the
          score above 85 as a discipline.
        </LI>
        <LI>
          When you ship, export the reconstructed prompt (not the original). The graph is
          the source of truth; the prompt is a view on it.
        </LI>
      </UL>

      <RelatedLinks
        slugs={[
          'concepts/prompt-graph-sync',
          'guides/import-a-prompt',
          'learn/versioning',
        ]}
      />
    </>
  )
}

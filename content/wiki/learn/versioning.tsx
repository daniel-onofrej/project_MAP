import {
  H2,
  P,
  UL,
  LI,
  Lead,
  Strong,
  A,
  InlineCode,
  KeyCombo,
  YouWillLearn,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout, Steps, Step } from '@/components/wiki/prose-client'
import { DiffPreviewMock } from '@/components/wiki/mockups'

export const toc = [
  { id: 'snapshots', label: 'Snapshots', level: 2 as const },
  { id: 'diffing', label: 'Diffing versions', level: 2 as const },
  { id: 'rollback', label: 'Rolling back', level: 2 as const },
  { id: 'naming', label: 'Naming conventions', level: 2 as const },
  { id: 'portability', label: 'Portability and export', level: 2 as const },
]

export default function Versioning() {
  return (
    <>
      <Lead>
        A graph is worth more when you can experiment freely and walk changes back. MAP
        treats every save as an immutable snapshot: you get a full git-like history of your
        agent, you can diff any two versions, and you can restore an older one with a
        single click. This page explains how snapshots are structured and how to use them
        well.
      </Lead>

      <YouWillLearn
        items={[
          'Create a named snapshot and understand what it contains',
          'Diff any two versions side by side',
          'Roll back without losing your current work',
          'Adopt a naming convention that scales past a dozen versions',
        ]}
      />

      <H2 id="snapshots">Snapshots</H2>
      <P>
        Every time you press <KeyCombo keys={['Ctrl', 'S']} /> MAP creates a new{' '}
        <Strong>snapshot</Strong> in the versions panel. A snapshot is a complete,
        standalone copy of the graph — nodes, edges, layout positions, comments,
        conflict-dismissal flags, and the originating prompt. Snapshots are append-only:
        saving never overwrites an earlier version.
      </P>
      <P>
        Each snapshot gets an auto-incremented identifier (<InlineCode>v1</InlineCode>,{' '}
        <InlineCode>v1.1</InlineCode>, <InlineCode>v1.2</InlineCode>…) and an optional
        label. If you restore an older version and then save, the new version forks from
        the restored parent — for example, restoring <InlineCode>v1.1</InlineCode> and
        saving produces <InlineCode>v1.1.1</InlineCode>, preserving the original lineage.
      </P>

      <Callout type="note">
        Snapshots are stored in the database (in multi-user installs) and in{' '}
        <InlineCode>localStorage</InlineCode> under <InlineCode>MAP_versions</InlineCode>{' '}
        (in single-user mode). Clearing browser storage in single-user mode will remove
        your history; export your graph as JSON before doing so.
      </Callout>

      <H2 id="diffing">Diffing versions</H2>
      <P>
        Select any version in the panel and click <Strong>Diff vs current</Strong> — or
        pick two versions and choose <Strong>Diff selected</Strong>. MAP renders a
        side-by-side view: added nodes are green, removed nodes are red, edges are
        highlighted when their source or target changed.
      </P>

      <DiffPreviewMock />

      <P>
        The diff is structural, not textual. Re-positioning a node doesn&apos;t show up as a
        change; only type changes, label changes, and edge changes do. If you also want a
        textual diff against the original prompt, switch to the{' '}
        <Strong>Prompt diff</Strong> tab — that one runs the same word-level comparison the
        re-sync feature uses.
      </P>

      <H2 id="rollback">Rolling back</H2>
      <P>Rolling back is a two-step operation on purpose:</P>
      <Steps>
        <Step n={1} title="Preview the target version">
          <P>
            Click a snapshot in the versions panel. MAP loads it into a preview canvas
            without touching your current working graph. You can pan and inspect, but you
            can&apos;t edit in preview mode.
          </P>
        </Step>
        <Step n={2} title="Promote it to the working graph">
          <P>
            Click <Strong>Restore</Strong>. MAP copies the snapshot back into the
            editable canvas. Your previous working state isn&apos;t lost — it&apos;s saved
            as an auto-snapshot labelled <InlineCode>before restore</InlineCode>, so you
            can always return to it.
          </P>
        </Step>
      </Steps>

      <Callout type="tip">
        If you realize mid-edit that the last five minutes of work was the wrong direction,
        don&apos;t restore — just hit <KeyCombo keys={['Ctrl', 'Z']} /> repeatedly. The
        command history is separate from the snapshot history and covers the session
        granularly. Restore is for reverting past a save, not within one.
      </Callout>

      <H2 id="naming">Naming conventions</H2>
      <P>
        Auto-generated identifiers (<InlineCode>v2.3.1</InlineCode>) are helpful for
        lineage but useless for finding &ldquo;the one before the refund change.&rdquo;
        Name your snapshots. A convention that works well for most teams:
      </P>
      <UL>
        <LI>
          <InlineCode>baseline</InlineCode> — the initial generated graph before any edits.
        </LI>
        <LI>
          <InlineCode>feat: raised refund threshold</InlineCode> — a feature-like change.
        </LI>
        <LI>
          <InlineCode>fix: added missing fallback branch</InlineCode> — a bug fix.
        </LI>
        <LI>
          <InlineCode>wip: testing parallel tool calls</InlineCode> — work in progress;
          don&apos;t share yet.
        </LI>
      </UL>
      <P>
        If you&apos;re using MAP in a team, drop a note in the snapshot&apos;s comment
        field explaining <em>why</em> rather than <em>what</em> — the what is visible in
        the diff.
      </P>

      <H2 id="portability">Portability and export</H2>
      <P>
        Every snapshot can be exported. From the versions panel, pick a snapshot and click{' '}
        <Strong>Export JSON</Strong>. The file is self-contained: it includes the graph, the
        originating prompt, and the metadata needed to reimport cleanly into another MAP
        instance.
      </P>
      <P>
        If you&apos;re moving between environments (local → production, or between teams),
        export the named version rather than the current working graph. Exports are a
        natural way to share a reference implementation without giving the other team
        write access to your workspace.
      </P>

      <RelatedLinks
        slugs={[
          'guides/export-and-share',
          'learn/collaborate-with-a-team',
          'reference/keyboard-shortcuts',
        ]}
      />
    </>
  )
}

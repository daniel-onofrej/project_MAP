import { H2, P, UL, LI, Lead, Strong, A, InlineCode, RelatedLinks } from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'export-json', label: 'Export as JSON', level: 2 as const },
  { id: 'export-prompt', label: 'Export the reconstructed prompt', level: 2 as const },
  { id: 'share-link', label: 'Read-only share links', level: 2 as const },
  { id: 'group-share', label: 'Share with a group', level: 2 as const },
]

export default function ExportAndShare() {
  return (
    <>
      <Lead>
        A graph is more useful when it travels. MAP supports four distinct sharing paths
        — JSON export, prompt export, time-boxed read-only links, and group-level sharing
        — each suited to a different audience. Pick the one that matches who you&apos;re
        sharing with and how much they should be able to do with it.
      </Lead>

      <H2 id="export-json">Export as JSON</H2>
      <P>
        JSON is the portable format. From the versions panel, pick a version and click{' '}
        <Strong>Export JSON</Strong>. The file is self-contained — nodes, edges, layout,
        comments, and the originating prompt — and it imports cleanly into any other MAP
        instance running a compatible version.
      </P>
      <P>
        Use this path when: moving a graph between environments (dev → prod), backing up a
        graph before a risky edit, or handing a graph to another MAP user who is not in
        your workspace.
      </P>

      <H2 id="export-prompt">Export the reconstructed prompt</H2>
      <P>
        Sometimes the recipient doesn&apos;t care about the graph — they want a plain
        system prompt they can paste into their own tooling. From the toolbar, click{' '}
        <Strong>Re-sync → Copy prompt</Strong>. The reconstructed prompt is placed on your
        clipboard as raw text.
      </P>
      <P>
        Use this path when: shipping to a production runtime that only understands prompts,
        onboarding a teammate who isn&apos;t using MAP yet, or integrating with a tool
        that expects a string (OpenAI Assistant, a custom agent runner).
      </P>

      <H2 id="share-link">Read-only share links</H2>
      <P>
        If you want someone to <em>see</em> a graph without giving them write access, open
        the versions panel, pick a version, and click <Strong>Generate share link</Strong>.
        MAP creates a URL that serves a frozen view of that version — full canvas,
        zoom/pan, node comments, but no editing affordances.
      </P>
      <P>
        Share links have a configurable expiry (defaults vary; most instances cap at 30
        days). The recipient doesn&apos;t need a MAP account to open the link;
        share-link access is the only unauthenticated surface in MAP.
      </P>

      <Callout type="warning">
        Share links expose the <em>contents</em> of that version, including node labels
        and comments. If your graph contains sensitive business logic you don&apos;t want
        external readers to see, don&apos;t use share links — use group-level sharing
        instead.
      </Callout>

      <H2 id="group-share">Share with a group</H2>
      <P>
        Moving a graph into a group workspace shares it with every member of that group,
        with their respective roles (admin, editor, viewer). From the graph in the
        editor, click <Strong>Share → Move to group</Strong> and pick the target. The
        graph is now visible to the group; the version history travels with it.
      </P>
      <P>
        Use this path when: a graph has graduated from your personal workspace to a team
        deliverable, or when you want collaborative editing rather than a one-way share.
      </P>

      <RelatedLinks
        slugs={[
          'learn/collaborate-with-a-team',
          'learn/versioning',
          'concepts/workspaces-and-groups',
        ]}
      />
    </>
  )
}

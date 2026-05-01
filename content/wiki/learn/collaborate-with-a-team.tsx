import {
  H2,
  P,
  UL,
  LI,
  Lead,
  Strong,
  A,
  InlineCode,
  YouWillLearn,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'workspaces', label: 'Workspaces and groups', level: 2 as const },
  { id: 'roles', label: 'Roles at a glance', level: 2 as const },
  { id: 'sharing', label: 'Sharing a graph', level: 2 as const },
  { id: 'review', label: 'Review flow', level: 2 as const },
]

export default function CollaborateWithATeam() {
  return (
    <>
      <Lead>
        MAP is designed to be shared. A graph is rarely the work of one person — a PM
        drafts the intent, an engineer fills in the tools, a reviewer checks the guard
        coverage. This page walks through how MAP structures that collaboration:
        workspaces, roles, sharing, and review.
      </Lead>

      <YouWillLearn
        items={[
          'How personal and group workspaces differ',
          'What admin, editor, and viewer roles can each do',
          'How to share a graph with a group without giving up edit rights',
          'The lightweight review flow most teams adopt',
        ]}
      />

      <H2 id="workspaces">Workspaces and groups</H2>
      <P>
        Every graph lives inside a <Strong>workspace</Strong>. Your{' '}
        <Strong>Personal</Strong> workspace is private — no one else can see or list its
        graphs. A <Strong>Group</Strong> workspace is shared with every member of that
        group; anyone in the group can list, open, and (subject to their role) edit graphs
        inside it.
      </P>
      <P>
        The workspace switcher in the left sidebar filters the graph list to the active
        workspace. Creating a new graph always places it in the active workspace, so check
        the switcher before hitting <Strong>+ New Graph</Strong> if you plan to share.
      </P>

      <Callout type="note">
        A graph can&apos;t be moved between workspaces directly. If you started in Personal
        and want to share with a group, export the graph as JSON, switch workspaces, and
        import. The export carries the full version history.
      </Callout>

      <H2 id="roles">Roles at a glance</H2>
      <P>
        Three roles cover virtually every team use case:
      </P>
      <UL>
        <LI>
          <Strong>Admin</Strong> — everything. Create and delete graphs, manage group
          membership, mint MCP tokens, rotate API keys, change workspace settings.
        </LI>
        <LI>
          <Strong>Editor</Strong> — create and edit graphs in the workspace, save versions,
          and mint tokens scoped to their own graphs. Cannot change group membership or
          workspace settings.
        </LI>
        <LI>
          <Strong>Viewer</Strong> — read-only. Can open graphs, view versions, run graphs
          via the UI if the admin has allowed it, and comment on nodes. Cannot save a new
          version or change anything.
        </LI>
      </UL>
      <P>
        Roles are assigned per group, not per graph. If you need finer-grained control —
        for example, one graph that a contractor can edit but the rest of the workspace is
        off-limits — create a small group just for that graph.
      </P>

      <H2 id="sharing">Sharing a graph</H2>
      <P>
        To share a graph with a group, open the graph in the editor and click{' '}
        <Strong>Share</Strong> in the top-right. Pick the target group; everyone in that
        group will see the graph on their next page load.
      </P>
      <P>
        If you want a <em>read-only</em> share without moving the graph at all, open the
        <Strong> Versions</Strong> panel, pick a version, and click{' '}
        <Strong>Generate share link</Strong>. The resulting URL serves a frozen view of
        that version; nobody can edit through the link, and it expires on a configurable
        schedule.
      </P>

      <H2 id="review">Review flow</H2>
      <P>
        MAP doesn&apos;t force a pull-request-style review flow, but most teams adopt a
        lightweight pattern that emerges naturally from the features already shipped:
      </P>
      <UL>
        <LI>
          The editor saves a version labelled <InlineCode>wip: …</InlineCode> when the
          change is drafted.
        </LI>
        <LI>
          They drop a comment on the nodes that changed, explaining the rationale.
        </LI>
        <LI>
          A reviewer opens the version, uses <Strong>Diff vs previous</Strong> to see what
          changed, and either leaves further node comments or tags the author in a message.
        </LI>
        <LI>
          Once approved, the editor renames the version (<InlineCode>feat: …</InlineCode>)
          and the <InlineCode>wip</InlineCode> snapshot is kept for history.
        </LI>
      </UL>

      <Callout type="tip">
        If your review cadence is frequent, consider keeping a{' '}
        <InlineCode>main</InlineCode> graph that only the reviewer edits, and use{' '}
        <Strong>Export JSON</Strong> to promote approved versions from a personal workspace
        into it. This mirrors the gitflow pattern for teams that prefer explicit promotion.
      </Callout>

      <RelatedLinks
        slugs={[
          'concepts/workspaces-and-groups',
          'reference/permissions-and-roles',
          'guides/export-and-share',
        ]}
      />
    </>
  )
}

import { H2, P, Lead, Strong, RelatedLinks } from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'model', label: 'The permission model', level: 2 as const },
  { id: 'personal', label: 'Personal workspaces', level: 2 as const },
  { id: 'groups', label: 'Group workspaces', level: 2 as const },
  { id: 'moving', label: 'Moving graphs between workspaces', level: 2 as const },
]

export default function WorkspacesAndGroupsConcept() {
  return (
    <>
      <Lead>
        Every MAP graph lives in exactly one workspace. Workspaces come in two flavors
        — personal (one per user) and group (shared by multiple users) — and roles are
        scoped to the workspace, not to individual graphs. This page walks through the
        model end-to-end.
      </Lead>

      <H2 id="model">The permission model</H2>
      <P>
        The hierarchy is: <Strong>user → workspace → graph → version</Strong>. A user
        always belongs to at least one workspace (their personal one) and may belong to
        any number of group workspaces. Within each workspace the user holds one role —
        admin, editor, or viewer — and that role applies uniformly to every graph in the
        workspace.
      </P>
      <P>
        MAP deliberately does <Strong>not</Strong> offer per-graph permissions. The
        trade-off: you get a simple mental model (&ldquo;who can edit this?&rdquo; reduces
        to &ldquo;what role do I have in this workspace?&rdquo;) at the cost of needing
        to split graphs across workspaces when audiences differ.
      </P>

      <H2 id="personal">Personal workspaces</H2>
      <P>
        Every user has exactly one personal workspace, created at signup and never
        deleted. The owner is always the user, and the role is always admin. You
        cannot invite others into a personal workspace — it is single-seat by design.
        Graphs here are private: nothing in a personal workspace is visible to anyone
        else, including other members of groups you belong to.
      </P>
      <P>
        Personal workspaces are where drafts live. Most graphs start here and get promoted
        to a group workspace once they&apos;re worth collaborating on.
      </P>

      <H2 id="groups">Group workspaces</H2>
      <P>
        A group workspace is a named container with a member list. Each member has a role
        (admin / editor / viewer) assigned when they&apos;re invited. Admins can add or
        remove members, promote editors to admins, and manage the workspace&apos;s shared
        API keys. Editors can create, edit, and delete graphs; viewers can only read.
      </P>
      <Callout type="note">
        A user&apos;s role is per-workspace. You can be an admin in one group and a viewer
        in another. The UI always shows the current workspace&apos;s role in the header so
        you know what you can do before you try.
      </Callout>

      <H2 id="moving">Moving graphs between workspaces</H2>
      <P>
        Graphs are movable — from your personal workspace to a group, or from one group
        to another you&apos;re an admin of. When a graph moves, its full version history
        moves with it. API keys do <Strong>not</Strong> move; the graph picks up whatever
        keys are configured in the destination workspace on its next generation or re-sync.
      </P>
      <P>
        This is how the &ldquo;draft privately, share to the team&rdquo; flow works in
        practice: author in your personal workspace, confirm it works, and move it to the
        group workspace when you&apos;re ready for review.
      </P>

      <RelatedLinks
        slugs={[
          'reference/permissions-and-roles',
          'learn/collaborate-with-a-team',
          'concepts/data-privacy',
        ]}
      />
    </>
  )
}

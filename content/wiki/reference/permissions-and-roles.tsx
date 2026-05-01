import { H2, P, Lead, Strong, NodeBadge, RelatedLinks } from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'risk-categories', label: 'Risk categories', level: 2 as const },
  { id: 'guarded-vs-unguarded', label: 'Guarded vs Unguarded', level: 2 as const },
  { id: 'roles', label: 'Role matrix', level: 2 as const },
]

type Category = { name: string; color: string; examples: string; severity: 'high' | 'medium' | 'low' }

const CATEGORIES: Category[] = [
  { name: 'Financial', color: '#ef4444', examples: 'Refunds, payments, billing adjustments, invoicing', severity: 'high' },
  { name: 'System & Infrastructure', color: '#f59e0b', examples: 'Shell commands, deploys, server mutations, DB writes', severity: 'high' },
  { name: 'Data & Storage', color: '#3b82f6', examples: 'Memory writes, persistence, record deletes', severity: 'medium' },
  { name: 'Auth & Permissions', color: '#a855f7', examples: 'Role changes, token issuance, scope grants', severity: 'high' },
  { name: 'User Communication', color: '#06b6d4', examples: 'Emails, SMS, Slack/Teams messages, customer notifications', severity: 'medium' },
  { name: 'API & Integrations', color: '#10b981', examples: 'Outbound webhooks, third-party calls, external tool invocations', severity: 'medium' },
  { name: 'Logging & Audit', color: '#64748b', examples: 'Audit emissions, telemetry writes, compliance records', severity: 'low' },
  { name: 'Physical', color: '#ec4899', examples: 'Device control, IoT actuation, physical dispatch', severity: 'high' },
]

const ROLE_MATRIX = [
  { action: 'View a graph', admin: '✓', editor: '✓', viewer: '✓' },
  { action: 'Edit nodes and edges', admin: '✓', editor: '✓', viewer: '—' },
  { action: 'Generate / re-sync', admin: '✓', editor: '✓', viewer: '—' },
  { action: 'Save a new version', admin: '✓', editor: '✓', viewer: '—' },
  { action: 'Rollback to a version', admin: '✓', editor: '✓', viewer: '—' },
  { action: 'Delete a graph', admin: '✓', editor: '—', viewer: '—' },
  { action: 'Manage API keys', admin: '✓', editor: '—', viewer: '—' },
  { action: 'Invite / remove members', admin: '✓', editor: '—', viewer: '—' },
  { action: 'Mint / revoke MCP tokens', admin: '✓', editor: '—', viewer: '—' },
]

export default function PermissionsAndRolesReference() {
  return (
    <>
      <Lead>
        MAP has two orthogonal permission systems: <Strong>risk categories</Strong>{' '}
        classify actions inside a graph to help reviewers find unsafe steps, and{' '}
        <Strong>roles</Strong> control who can do what at the workspace level. This page
        is the reference for both.
      </Lead>

      <H2 id="risk-categories">Risk categories</H2>
      <P>
        Every <NodeBadge type="ACTION" />, <NodeBadge type="TOOL" />, and{' '}
        <NodeBadge type="MEMORY" /> node is classified into one of eight categories based
        on its label and the surrounding context. Categories drive the severity scoring
        surfaced in the Actions &amp; Permissions panel.
      </P>

      <div className="rounded-lg border border-border/50 overflow-hidden my-5">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
              <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Examples</th>
              <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-28">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {CATEGORIES.map((c) => (
              <tr key={c.name} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 align-top">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                    <span className="font-medium">{c.name}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground/80 align-top leading-6">{c.examples}</td>
                <td className="px-4 py-3 align-top">
                  <span className={
                    c.severity === 'high' ? 'text-red-400' :
                    c.severity === 'medium' ? 'text-amber-400' : 'text-muted-foreground'
                  }>
                    {c.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="guarded-vs-unguarded">Guarded vs Unguarded</H2>
      <P>
        An action is <Strong className="text-emerald-400">Guarded</Strong> if at least one{' '}
        <NodeBadge type="GUARD" /> node exists within three hops upstream along any path
        that can reach it. Otherwise it is <Strong>Unguarded</Strong>. High-severity
        Unguarded actions are flagged in red in the Actions &amp; Permissions panel.
      </P>
      <Callout type="note">
        The guard detection is static — it looks at graph structure, not runtime behavior.
        A guard whose condition always passes will still mark a downstream action as
        Guarded. Treat the badge as an architectural signal, not a proof of safety.
      </Callout>

      <H2 id="roles">Role matrix</H2>
      <P>
        Workspace roles control capabilities in the app itself. Each member of a workspace
        has exactly one role; role grants are managed by admins.
      </P>
      <div className="rounded-lg border border-border/50 overflow-hidden my-5">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Capability</th>
              <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-20 text-center">Admin</th>
              <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-20 text-center">Editor</th>
              <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-20 text-center">Viewer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {ROLE_MATRIX.map((r) => (
              <tr key={r.action} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5 font-medium">{r.action}</td>
                <td className="px-4 py-2.5 text-center text-emerald-400">{r.admin}</td>
                <td className="px-4 py-2.5 text-center">{r.editor === '✓' ? <span className="text-emerald-400">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2.5 text-center">{r.viewer === '✓' ? <span className="text-emerald-400">✓</span> : <span className="text-muted-foreground">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RelatedLinks
        slugs={[
          'concepts/risk-categories',
          'guides/audit-risky-actions',
          'concepts/workspaces-and-groups',
        ]}
      />
    </>
  )
}

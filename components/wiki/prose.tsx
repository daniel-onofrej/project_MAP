import Link from 'next/link'
import { ArrowRight, Github } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { NODE_COLORS, NODE_ICONS } from '@/lib/wiki/data'
import { getPageMeta } from '@/lib/wiki/manifest'

/**
 * Server-safe prose primitives for wiki content.
 * Client-only (animated) primitives live in ./prose-client.tsx.
 */

export function PageHeader({
  eyebrow,
  title,
  lead,
  updated,
}: {
  eyebrow?: string
  title: string
  lead: string
  updated?: string
}) {
  return (
    <header className="mb-10 border-b border-border/40 pb-8">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
          {eyebrow}
        </p>
      )}
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.15] mb-4">
        {title}
      </h1>
      <p className="text-[15px] leading-7 text-muted-foreground max-w-[65ch]">{lead}</p>
      {updated && (
        <p className="text-xs text-muted-foreground/70 mt-4">Updated {updated}</p>
      )}
    </header>
  )
}

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="group scroll-mt-24 text-2xl font-semibold tracking-tight mt-14 mb-4"
    >
      <a href={`#${id}`} className="no-underline">
        {children}
        <span
          aria-hidden
          className="ml-2 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          #
        </span>
      </a>
    </h2>
  )
}

export function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-24 text-lg font-semibold tracking-tight mt-8 mb-3">
      {children}
    </h3>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-7 text-foreground/85 max-w-[70ch] mb-5">
      {children}
    </p>
  )
}

export function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-base leading-7 text-foreground/90 max-w-[70ch] mb-6 font-medium">
      {children}
    </p>
  )
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 text-foreground/85 max-w-[70ch] mb-5 marker:text-muted-foreground/60">
      {children}
    </ul>
  )
}

export function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal pl-6 space-y-2 text-[15px] leading-7 text-foreground/85 max-w-[70ch] mb-5 marker:text-muted-foreground/60">
      {children}
    </ol>
  )
}

export function LI({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/40 font-mono text-[0.85em] text-foreground/90">
      {children}
    </code>
  )
}

export function CodeBlock({
  language,
  children,
}: {
  language?: string
  children: string
}) {
  return (
    <div className="mb-5 rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      {language && (
        <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-muted/40 font-mono">
          {language}
        </div>
      )}
      <pre className="px-4 py-3 overflow-x-auto text-[13px] leading-6 font-mono text-foreground/90">
        <code>{children}</code>
      </pre>
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 font-mono text-[11px] text-foreground/90 shadow-[inset_0_-1px_0_rgba(0,0,0,0.2)]">
      {children}
    </kbd>
  )
}

export function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1 align-baseline">
      {keys.map((k, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <Kbd>{k}</Kbd>
          {i < keys.length - 1 && <span className="text-muted-foreground text-xs">+</span>}
        </span>
      ))}
    </span>
  )
}

export function NodeBadge({ type }: { type: string }) {
  const color = NODE_COLORS[type] ?? '#888'
  const icon = NODE_ICONS[type] ?? '◆'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded font-mono text-[11px] align-baseline"
      style={{ backgroundColor: color + '22', color }}
    >
      <span>{icon}</span>
      {type}
    </span>
  )
}

export function FeatureStatus({ status }: { status: 'live' | 'wip' | 'planned' }) {
  const map = {
    live: { label: 'Live', className: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' },
    wip: { label: 'WIP', className: 'border-amber-500/40 text-amber-400 bg-amber-500/10' },
    planned: { label: 'Planned', className: 'border-slate-500/40 text-slate-400 bg-slate-500/10' },
  }[status]
  return (
    <Badge variant="outline" className={`text-[10px] ${map.className}`}>
      {map.label}
    </Badge>
  )
}

export function YouWillLearn({ items }: { items: string[] }) {
  return (
    <div className="mb-8 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2">
        You&apos;ll learn
      </p>
      <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-foreground/90 marker:text-cyan-400/70">
        {items.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

export function RelatedLinks({ slugs }: { slugs: string[] }) {
  const pages = slugs.map((s) => getPageMeta(s)).filter((p): p is NonNullable<typeof p> => !!p)
  if (pages.length === 0) return null
  return (
    <div className="mt-14 pt-8 border-t border-border/40">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        See also
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {pages.map((p) => (
          <Link
            key={p.slug}
            href={`/wiki/${p.slug}`}
            className="group rounded-lg border border-border/40 bg-card/50 p-4 hover:border-border hover:bg-card transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium mb-0.5 truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {p.summary}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function NextPrev({
  prev,
  next,
}: {
  prev?: { slug: string; title: string }
  next?: { slug: string; title: string }
}) {
  if (!prev && !next) return null
  return (
    <nav className="mt-10 grid gap-3 sm:grid-cols-2" aria-label="Adjacent pages">
      {prev ? (
        <Link
          href={`/wiki/${prev.slug}`}
          className="group rounded-lg border border-border/40 bg-card/30 p-4 hover:border-border transition-colors"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            ← Previous
          </p>
          <p className="text-sm font-medium group-hover:text-foreground transition-colors">
            {prev.title}
          </p>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/wiki/${next.slug}`}
          className="group rounded-lg border border-border/40 bg-card/30 p-4 hover:border-border transition-colors text-right"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Next →
          </p>
          <p className="text-sm font-medium group-hover:text-foreground transition-colors">
            {next.title}
          </p>
        </Link>
      ) : (
        <div />
      )}
    </nav>
  )
}

export function EditOnGitHub({ slug }: { slug: string }) {
  // Repo URL still uses placeholder; fallback path is informational only.
  const url = `https://github.com/YOUR_ORG/MAP/edit/main/content/wiki/${slug}.tsx`
  return (
    <div className="mt-8 text-xs text-muted-foreground">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <Github className="h-3.5 w-3.5" />
        Edit this page on GitHub
      </a>
    </div>
  )
}

export function Divider() {
  return <hr className="my-10 border-border/40" />
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^https?:/.test(href)
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-500/40 hover:decoration-cyan-400"
      >
        {children}
      </a>
    )
  }
  return (
    <Link
      href={href}
      className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-500/40 hover:decoration-cyan-400"
    >
      {children}
    </Link>
  )
}

export function Strong({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <strong className={`font-semibold text-foreground ${className ?? ''}`.trim()}>
      {children}
    </strong>
  )
}

export function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground italic mt-2 text-center">{children}</p>
  )
}

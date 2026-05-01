'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Info, Lightbulb, ShieldAlert } from 'lucide-react'
import { useState } from 'react'

type CalloutType = 'note' | 'tip' | 'warning' | 'danger'

const CALLOUT_MAP: Record<CalloutType, { icon: any; className: string; label: string }> = {
  note: { icon: Info, className: 'border-blue-500/40 bg-blue-500/5 text-blue-300', label: 'Note' },
  tip: { icon: Lightbulb, className: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300', label: 'Tip' },
  warning: { icon: AlertTriangle, className: 'border-amber-500/40 bg-amber-500/5 text-amber-300', label: 'Warning' },
  danger: { icon: ShieldAlert, className: 'border-red-500/40 bg-red-500/5 text-red-300', label: 'Danger' },
}

export function Callout({
  type = 'note',
  title,
  children,
}: {
  type?: CalloutType
  title?: string
  children: React.ReactNode
}) {
  const reduce = useReducedMotion()
  const { icon: Icon, className, label } = CALLOUT_MAP[type]
  return (
    <motion.aside
      role="note"
      initial={reduce ? false : { opacity: 0, scale: 0.98, y: 4 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`my-6 rounded-lg border-l-4 border border-border/40 pl-4 pr-4 py-3 ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1">
            {title ?? label}
          </p>
          <div className="text-[14px] leading-6 text-foreground/85">{children}</div>
        </div>
      </div>
    </motion.aside>
  )
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="my-8 space-y-0 relative">{children}</ol>
}

export function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, x: -6 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative pl-12 pb-8 last:pb-0 border-l border-border/40 ml-4 last:border-l-transparent"
    >
      <span
        className="absolute -left-[17px] top-0 flex h-8 w-8 items-center justify-center rounded-full bg-background border border-border/60 text-[13px] font-semibold text-cyan-400 font-mono"
        aria-hidden
      >
        {n}
      </span>
      <h3 className="text-base font-semibold mb-2 leading-snug">{title}</h3>
      <div className="text-[15px] leading-7 text-foreground/85 [&>p]:mb-3 [&>p:last-child]:mb-0">
        {children}
      </div>
    </motion.li>
  )
}

export function Screenshot({
  src,
  alt,
  caption,
  frame = true,
}: {
  src?: string
  alt: string
  caption?: string
  frame?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <motion.figure
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="my-8"
    >
      <div
        className={`relative overflow-hidden rounded-lg ${
          frame ? 'border border-border/50 bg-muted/20 shadow-sm' : ''
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="block w-full h-auto" loading="lazy" />
        ) : (
          <ScreenshotPlaceholder label={alt} />
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-muted-foreground italic text-center">
          {caption}
        </figcaption>
      )}
    </motion.figure>
  )
}

function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <div className="aspect-[16/9] flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted/40 via-muted/20 to-muted/40">
      <div className="flex gap-1.5 absolute top-3 left-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
      </div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">Screenshot</p>
      <p className="text-sm text-foreground/70 max-w-[80%] text-center">{label}</p>
    </div>
  )
}

export function AutoPlayDemo({
  src,
  poster,
  alt,
}: {
  src?: string
  poster?: string
  alt: string
}) {
  const reduce = useReducedMotion()
  if (!src) {
    return (
      <div className="my-8 rounded-lg border border-border/50 bg-muted/20 aspect-video flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Demo: {alt}</p>
      </div>
    )
  }
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.3 }}
      className="my-8 rounded-lg overflow-hidden border border-border/50 bg-black"
    >
      <video
        src={src}
        poster={poster}
        aria-label={alt}
        autoPlay={!reduce}
        muted
        loop
        playsInline
        preload="none"
        className="block w-full h-auto"
      />
    </motion.div>
  )
}

export function Collapsible({
  summary,
  children,
}: {
  summary: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-6 rounded-lg border border-border/40 bg-card/30 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
        aria-expanded={open}
      >
        <span>{summary}</span>
        <span
          className="text-muted-foreground text-xs"
          aria-hidden
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 180ms' }}
        >
          ▶
        </span>
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.2 }}
          className="px-4 pb-4 pt-1 text-[14px] leading-6 text-foreground/85 [&>p]:mb-3 [&>p:last-child]:mb-0"
        >
          {children}
        </motion.div>
      )}
    </div>
  )
}

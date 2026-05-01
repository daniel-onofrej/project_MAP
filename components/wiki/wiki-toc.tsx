'use client'

import { useEffect, useState } from 'react'

export type TocItem = { id: string; label: string; level?: 2 | 3 }

export function WikiToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (items.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] },
    )
    items.forEach((i) => {
      const el = document.getElementById(i.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <aside className="hidden xl:block w-52 shrink-0 sticky top-10 h-fit self-start">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        On this page
      </p>
      <ul className="space-y-1.5 border-l border-border/40">
        {items.map((item) => {
          const isActive = active === item.id
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`block text-[12px] leading-5 -ml-px border-l-2 pl-3 transition-colors ${
                  item.level === 3 ? 'pl-5' : 'pl-3'
                } ${
                  isActive
                    ? 'border-cyan-400 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

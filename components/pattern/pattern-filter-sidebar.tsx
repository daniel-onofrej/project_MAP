'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { PATTERN_CATEGORIES } from '@/lib/patterns'
import { PATTERN_DOMAINS } from '@/lib/types'
import type { PatternCategory, PatternDomain, PatternComplexity } from '@/lib/types'

export interface PatternFilters {
  categories: PatternCategory[]
  domains: PatternDomain[]
  complexities: PatternComplexity[]
}

interface Props {
  filters: PatternFilters
  onChange: (filters: PatternFilters) => void
  counts: {
    categories: Record<string, number>
    domains: Record<string, number>
    complexities: Record<string, number>
  }
}

const COMPLEXITIES: { id: PatternComplexity; label: string }[] = [
  { id: 'simple', label: 'Simple' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

function FilterGroup<T extends string>({
  title,
  items,
  selected,
  counts,
  onToggle,
}: {
  title: string
  items: { id: T; label: string; icon?: string }[]
  selected: T[]
  counts: Record<string, number>
  onToggle: (id: T) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider hover:text-neutral-200 transition-colors"
      >
        <span>{title}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="space-y-0.5 mt-1">
          {items.map((item) => {
            const active = selected.includes(item.id)
            const count = counts[item.id] ?? 0
            return (
              <button
                key={item.id}
                onClick={() => onToggle(item.id)}
                className={`flex items-center justify-between w-full px-2 py-1.5 rounded text-xs transition-colors ${
                  active
                    ? 'bg-indigo-600/30 text-indigo-300'
                    : 'text-neutral-300 hover:bg-neutral-700/50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {item.icon && <span>{item.icon}</span>}
                  {item.label}
                </span>
                <span className="text-neutral-500 text-[10px]">{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function PatternFilterSidebar({ filters, onChange, counts }: Props) {
  const hasFilters =
    filters.categories.length > 0 ||
    filters.domains.length > 0 ||
    filters.complexities.length > 0

  function toggleCategory(id: PatternCategory) {
    const next = filters.categories.includes(id)
      ? filters.categories.filter((c) => c !== id)
      : [...filters.categories, id]
    onChange({ ...filters, categories: next })
  }

  function toggleDomain(id: PatternDomain) {
    const next = filters.domains.includes(id)
      ? filters.domains.filter((d) => d !== id)
      : [...filters.domains, id]
    onChange({ ...filters, domains: next })
  }

  function toggleComplexity(id: PatternComplexity) {
    const next = filters.complexities.includes(id)
      ? filters.complexities.filter((c) => c !== id)
      : [...filters.complexities, id]
    onChange({ ...filters, complexities: next })
  }

  return (
    <div className="w-48 flex-shrink-0 border-r border-neutral-700/50 pr-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Filters</span>
        {hasFilters && (
          <button
            onClick={() => onChange({ categories: [], domains: [], complexities: [] })}
            className="text-[10px] text-neutral-500 hover:text-neutral-300 flex items-center gap-0.5"
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      <FilterGroup
        title="Category"
        items={PATTERN_CATEGORIES.map((c) => ({ id: c.id as PatternCategory, label: c.label, icon: c.icon }))}
        selected={filters.categories}
        counts={counts.categories}
        onToggle={toggleCategory}
      />

      <FilterGroup
        title="Domain"
        items={PATTERN_DOMAINS.map((d) => ({ id: d.id, label: d.label }))}
        selected={filters.domains}
        counts={counts.domains}
        onToggle={toggleDomain}
      />

      <FilterGroup
        title="Complexity"
        items={COMPLEXITIES}
        selected={filters.complexities}
        counts={counts.complexities}
        onToggle={toggleComplexity}
      />
    </div>
  )
}

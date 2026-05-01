'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { PATTERN_CATEGORIES } from '@/lib/patterns'
import { PATTERN_DOMAINS } from '@/lib/types'
import type { PatternCategory, PatternDomain, PatternComplexity } from '@/lib/types'

const CATEGORY_ICONS: Record<string, string[]> = {
  reasoning: ['🔗', '🧠', '💭', '🔍', '📝', '⚙️'],
  validation: ['🛡️', '✅', '🔒', '🎯', '📋', '🔐'],
  'error-handling': ['🪂', '🔄', '⚠️', '🚨', '🛠️', '🔧'],
  routing: ['🚦', '🔀', '🗺️', '🧭', '📡', '🔁'],
  memory: ['🧠', '💾', '📚', '🗃️', '🔮', '📌'],
  integration: ['🔧', '🔌', '🌐', '⚡', '🔗', '📡'],
}

interface Props {
  open: boolean
  onClose: () => void
  onSave: (meta: {
    name: string
    description: string
    category: PatternCategory
    domain: PatternDomain | null
    complexity: PatternComplexity
    icon: string
    isPublic: boolean
  }) => Promise<void>
  initialName?: string
  initialDescription?: string
  initialComplexity?: PatternComplexity
  initialCategory?: PatternCategory
}

export function PatternSaveDialog({ open, onClose, onSave, initialName = '', initialDescription = '', initialComplexity = 'simple', initialCategory = 'reasoning' }: Props) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [category, setCategory] = useState<PatternCategory>(initialCategory)
  const [domain, setDomain] = useState<PatternDomain | ''>('')
  const [complexity, setComplexity] = useState<PatternComplexity>(initialComplexity)
  const [icon, setIcon] = useState('🔧')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)

  const iconSuggestions = CATEGORY_ICONS[category] ?? ['🔧', '⚙️', '💡', '🔗', '🧩', '🎯']

  if (!open) return null

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        category,
        domain: domain || null,
        complexity,
        icon,
        isPublic,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-[480px] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-neutral-100">Save as Pattern</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500"
              placeholder="e.g. Customer Refund Handler"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="What does this pattern do?"
            />
          </div>

          {/* Category + Domain row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PatternCategory)}
                className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500"
              >
                {PATTERN_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Domain</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as PatternDomain | '')}
                className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="">None</option>
                {PATTERN_DOMAINS.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Complexity */}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Complexity</label>
            <div className="flex gap-2">
              {(['simple', 'intermediate', 'advanced'] as PatternComplexity[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setComplexity(c)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    complexity === c
                      ? 'bg-indigo-600 text-white'
                      : 'bg-neutral-800 border border-neutral-600 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Icon</label>
            <div className="flex gap-2">
              {iconSuggestions.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${
                    icon === emoji ? 'bg-indigo-600/30 ring-1 ring-indigo-500' : 'bg-neutral-800 hover:bg-neutral-700'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Visibility */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => setIsPublic(false)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                !isPublic ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300' : 'border-neutral-600 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              My Workspace
            </button>
            <button
              onClick={() => setIsPublic(true)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                isPublic ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300' : 'border-neutral-600 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Community (public)
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-neutral-600 text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Pattern'}
          </button>
        </div>
      </div>
    </div>
  )
}

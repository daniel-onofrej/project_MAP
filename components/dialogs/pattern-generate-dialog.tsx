'use client'
import { useState } from 'react'
import { X, Sparkles, Loader2 } from 'lucide-react'
import type { PromptPattern } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onGenerated: (pattern: PromptPattern) => void
  apiKey?: string
}

export function PatternGenerateDialog({ open, onClose, onGenerated, apiKey }: Props) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleGenerate() {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/patterns/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), apiKey }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Generation failed')
      }

      const { pattern } = await res.json()
      onGenerated(pattern)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-[520px] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-400" />
            <h2 className="text-base font-semibold text-neutral-100">AI Generate Pattern</h2>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300"><X size={16} /></button>
        </div>

        <p className="text-xs text-neutral-400 mb-4">
          Describe what this pattern should do. Keep it brief — the AI will fill in the structure.
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="e.g. handle customer refund escalation with retry logic"
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2.5 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500 resize-none placeholder-neutral-600"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
          }}
        />

        {!apiKey && (
          <p className="text-xs text-amber-400 mt-2">
            No API key configured. Add a Gemini API key in Settings to use AI generation.
          </p>
        )}

        {error && (
          <p className="text-xs text-red-400 mt-2">{error}</p>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-neutral-600 text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
            className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><Sparkles size={14} /> Generate</>}
          </button>
        </div>
      </div>
    </div>
  )
}

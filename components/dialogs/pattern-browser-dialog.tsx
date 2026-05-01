'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, Eye } from 'lucide-react';
import { BUILT_IN_PATTERNS, PATTERN_CATEGORIES } from '@/lib/patterns';
import type { PatternCategory, PromptPattern } from '@/lib/types';
import { PatternPreviewDialog } from '@/components/dialogs/pattern-preview-dialog';

interface PatternBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (pattern: PromptPattern) => void;
}

export function PatternBrowserDialog({
  open,
  onOpenChange,
  onInsert,
}: PatternBrowserDialogProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<PatternCategory | 'all'>('all');
  const [previewPattern, setPreviewPattern] = useState<PromptPattern | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return BUILT_IN_PATTERNS.filter(p => {
      const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  function handleInsert(pattern: PromptPattern) {
    onInsert(pattern);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[780px] w-[780px] h-[680px] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <DialogTitle>Pattern Library</DialogTitle>
            </div>
            <Input
              placeholder="Search patterns..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="mt-2"
              autoFocus
            />
          </DialogHeader>

          {/* Category filter */}
          <div className="flex gap-2 px-6 py-3 border-b flex-wrap shrink-0">
            <button
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${activeCategory === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-gray-200 hover:border-gray-400'
                }`}
              onClick={() => setActiveCategory('all')}
            >
              All ({BUILT_IN_PATTERNS.length})
            </button>
            {PATTERN_CATEGORIES.map(cat => {
              const count = BUILT_IN_PATTERNS.filter(p => p.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-gray-200 hover:border-gray-400'
                    }`}
                  onClick={() => setActiveCategory(cat.id as PatternCategory)}
                >
                  {cat.icon} {cat.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Pattern grid */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="grid grid-cols-3 gap-3 p-6">
                {filtered.length === 0 && (
                  <p className="col-span-3 text-center text-sm text-muted-foreground py-8">
                    No patterns match your search.
                  </p>
                )}
                {filtered.map(pattern => (
                  <div
                    key={pattern.id}
                    className="border rounded-lg p-4 hover:border-primary hover:shadow-sm transition-all group flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl shrink-0">{pattern.icon}</span>
                        <span className="font-medium text-sm leading-tight">{pattern.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {pattern.nodes.length} nodes
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3 flex-1">
                      {pattern.description}
                    </p>
                    <div className="flex gap-2 mt-auto">
                      <button
                        onClick={() => setPreviewPattern(pattern)}
                        className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded border border-neutral-600 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50 transition-colors"
                      >
                        <Eye size={11} /> Preview
                      </button>
                      <button
                        onClick={() => handleInsert(pattern)}
                        className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                      >
                        <Plus size={11} /> Insert
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <PatternPreviewDialog
        pattern={previewPattern}
        open={!!previewPattern}
        onClose={() => setPreviewPattern(null)}
        canInsert={true}
        onInsert={(p) => {
          handleInsert(p);
          setPreviewPattern(null);
        }}
      />
    </>
  );
}

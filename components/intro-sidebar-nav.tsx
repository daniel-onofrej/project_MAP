'use client';

import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { label: 'Overview', id: 'hero' },
  { label: 'How It Works', id: 'how-it-works' },
  { label: 'Visual Editor', id: 'visual-editor' },
  { label: 'AI Generation', id: 'ai-generation' },
  { label: 'Output Formats', id: 'output-formats' },
  { label: 'Graph Chat', id: 'graph-chat' },
  { label: 'Re-sync', id: 'resync' },
  { label: 'Version Control', id: 'version-control' },
  { label: 'Conflict & DAG', id: 'conflict-dag' },
  { label: 'Execution', id: 'execution' },
  { label: 'Node Types', id: 'node-types' },
  { label: 'Templates', id: 'templates' },
  { label: 'All Features', id: 'features' },
  { label: 'Coming Soon', id: 'coming-soon' },
] as const;

export function IntroSidebarNav() {
  const [activeId, setActiveId] = useState<string>('hero');

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    NAV_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(id);
        },
        { rootMargin: '-15% 0px -80% 0px', threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  function handleClick(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className="hidden lg:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 flex-col gap-0.5">
      {NAV_ITEMS.map(({ label, id }) => {
        const isActive = activeId === id;
        return (
          <button
            key={id}
            onClick={() => handleClick(id)}
            className={`text-left pl-3 pr-2 py-1 text-[11px] font-medium rounded-r transition-all duration-150 border-l-2 ${isActive
              ? 'border-[#C15F3C] text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// Detect Mac to show ⌘ vs Ctrl
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Graph Editing',
    shortcuts: [
      { keys: [mod, 'S'], description: 'Save agent' },
      { keys: [mod, 'Z'], description: 'Undo' },
      { keys: [mod, 'Y'], description: 'Redo' },
      { keys: [mod, 'C'], description: 'Copy selected node' },
      { keys: [mod, 'V'], description: 'Paste node' },
      { keys: [mod, 'D'], description: 'Duplicate selected node' },
      { keys: ['Delete'], description: 'Delete selected node' },
    ],
  },
  {
    title: 'Navigation & View',
    shortcuts: [
      { keys: [mod, 'F'], description: 'Find / search nodes' },
      { keys: [mod, 'B'], description: 'Toggle sidebar' },
      { keys: ['?'], description: 'Open this shortcuts dialog' },
    ],
  },
  {
    title: 'Chat & Comments',
    shortcuts: [
      { keys: [mod, 'Enter'], description: 'Send message or comment' },
      { keys: ['/help'], description: 'Show all chat commands and usage guide' },
      { keys: ['/mcp'], description: 'MCP server info and available tools' },
    ],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>⌨️</span> Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-5 py-2">
            {SHORTCUT_GROUPS.map((group, gi) => (
              <div key={group.title}>
                {gi > 0 && <Separator className="mb-4" />}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {group.title}
                </p>
                <div className="space-y-2">
                  {group.shortcuts.map((s) => (
                    <div key={s.description} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-foreground">{s.description}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
                            <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted border border-border rounded shadow-sm">
                              {k}
                            </kbd>
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <p className="text-[11px] text-center text-muted-foreground pt-1 border-t">
          Press <kbd className="px-1 py-0.5 text-[10px] font-mono bg-muted border border-border rounded">?</kbd> anytime to open this dialog
        </p>
      </DialogContent>
    </Dialog>
  );
}

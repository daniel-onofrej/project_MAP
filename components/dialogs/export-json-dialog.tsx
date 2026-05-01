'use client';

import { useState, useMemo } from 'react';
import { Copy, Check, Download, FileJson, Eye, Code } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import type { AgentConfig } from '@/lib/types';

interface ExportJsonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentConfig | null;
}

export function ExportJsonDialog({ open, onOpenChange, agent }: ExportJsonDialogProps) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const json = useMemo(() => {
    if (!agent) return '';
    const sanitized = {
      ...agent,
      settings: agent.settings
        ? { ...agent.settings, apiKey: undefined }
        : agent.settings,
      rawLlmOutput: undefined, // exclude from expanded view
    };
    return JSON.stringify(sanitized, null, 2);
  }, [agent]);

  const rawOutput = useMemo(() => {
    if (!agent?.rawLlmOutput) return '';
    return agent.rawLlmOutput;
  }, [agent]);

  const hasRawOutput = !!agent?.rawLlmOutput;
  const activeContent = showRaw ? rawOutput : json;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const suffix = showRaw ? '_raw' : '';
    const blob = new Blob([activeContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent?.name?.replace(/\s+/g, '_') || 'agent'}${suffix}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Count raw output stats
  const rawChars = agent?.rawLlmOutput?.length ?? 0;
  const formatLabel = agent?.sourceFormat === 'json-compact' ? 'COMPACT' :
    agent?.sourceFormat === 'yaml' ? 'YAML' : 'JSON';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileJson className="h-5 w-5 text-indigo-500" />
              Export Graph JSON
            </DialogTitle>
            <DialogDescription className="text-xs">
              {showRaw
                ? 'Raw LLM output — the exact response before decoding and graph transformation.'
                : 'Full AgentConfig object — copy to clipboard or download as a .txt file.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 mt-4">
            <Button size="sm" variant="secondary" onClick={handleCopy} className="gap-1.5">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleDownload} className="gap-1.5">
              <Download className="h-4 w-4" />
              Download .txt
            </Button>

            {/* Raw/Expanded toggle */}
            {hasRawOutput && (
              <Button
                size="sm"
                variant={showRaw ? 'default' : 'outline'}
                onClick={() => { setShowRaw(!showRaw); setCopied(false); }}
                className="gap-1.5 ml-2"
              >
                {showRaw ? <Eye className="h-4 w-4" /> : <Code className="h-4 w-4" />}
                {showRaw ? 'Expanded' : 'Raw Output'}
              </Button>
            )}

            <span className="ml-auto text-[10px] text-muted-foreground font-mono">
              {showRaw ? (
                <>
                  {rawChars.toLocaleString()} chars ·{' '}
                  <span className="px-1 py-0.5 rounded bg-green-500/20 text-green-400 font-semibold">
                    {formatLabel}
                  </span>
                </>
              ) : (
                <>
                  {json.length.toLocaleString()} chars · {agent?.nodes?.length ?? 0} nodes · {agent?.connections?.length ?? 0} edges
                </>
              )}
            </span>
          </div>
        </div>

        {/* Scrollable JSON */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <pre className="p-6 text-[11px] font-mono leading-relaxed text-foreground whitespace-pre-wrap break-all bg-muted/30 min-h-full">
            {activeContent || (showRaw ? 'No raw output available for this agent.' : json)}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

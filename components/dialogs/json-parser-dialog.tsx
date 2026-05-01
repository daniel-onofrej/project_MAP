'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { FileJson, AlertCircle } from 'lucide-react';
import { normalizeAgentConfig } from '@/lib/storage/storage';
import type { AgentConfig } from '@/lib/types';

interface JsonParserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParse: (agent: AgentConfig) => void;
}

export function JsonParserDialog({ open, onOpenChange, onParse }: JsonParserDialogProps) {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isValidJson = (() => {
    if (!jsonText.trim()) return false;
    try {
      JSON.parse(jsonText);
      return true;
    } catch {
      return false;
    }
  })();

  const handleChange = (value: string) => {
    setJsonText(value);
    setError(null);
    if (value.trim()) {
      try {
        JSON.parse(value);
      } catch (e: any) {
        setError(e.message);
      }
    }
  };

  const handleBuild = () => {
    try {
      const data = JSON.parse(jsonText);
      const agent = normalizeAgentConfig(data);
      agent.id = `agent-${Date.now()}`;
      agent.createdAt = new Date().toISOString();
      agent.updatedAt = new Date().toISOString();
      onParse(agent);
      onOpenChange(false);
      setJsonText('');
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleClear = () => {
    setJsonText('');
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Parse JSON to Graph
          </DialogTitle>
          <DialogDescription>
            Paste your agent JSON below. Supports the standard AgentConfig format or the Skill format (metadata + graph).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3">
          <Textarea
            value={jsonText}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={`Paste your JSON here, e.g.:\n{\n  "id": "my-agent",\n  "name": "My Agent",\n  "nodes": [...],\n  "connections": [...]\n}`}
            className="font-mono text-xs min-h-[300px] max-h-[calc(100vh-16rem)] overflow-y-auto resize-y shrink-0"
            spellCheck={false}
          />

          {error && (
            <Alert variant="destructive" className="py-2 shrink-0">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 shrink-0 pt-2 border-t border-border mt-auto">
            <Button variant="ghost" onClick={handleClear} disabled={!jsonText}>
              Clear
            </Button>
            <Button onClick={handleBuild} disabled={!isValidJson}>
              <FileJson className="h-4 w-4 mr-2" />
              Build Graph
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

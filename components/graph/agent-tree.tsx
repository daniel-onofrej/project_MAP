'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { getNodeLineMapping } from '@/lib/text-to-graph';
import {
  Plus,
  FolderOpen,
  FileJson,
  Trash2,
  Download,
  Upload,
  Search,
  FileText,
  Network,
  FlaskConical,
  Lock,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  Users,
  ChevronRight,
  ChevronDown,
  Bot,
  Crown,
  Wrench,
  FileCode2,
  PackageCheck,
  PlusCircle,
} from 'lucide-react';
import type { AgentConfig } from '@/lib/types';
import type { RuntimeFile, RuntimePackage, RuntimeScript, RuntimeTool } from '@/lib/deployments/types';
import type { GenerationJob } from '../dialogs/ai-generator-dialog';
import type { MultiAgentJob } from '../dialogs/multi-agent-wizard';
import { cn } from '@/lib/utils';
import {
  deriveRuntimeAssetRequirements,
  normalizeRuntimePackage,
  runtimeToolCommand,
  runtimeToolPath,
  runtimeToolStub,
} from '@/lib/runtime-assets';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

const ASSET_TEXT_LIMIT = 30000;

function statusBadgeClass(status: string) {
  if (status === 'attached') return 'border-green-500/40 text-green-600 dark:text-green-300';
  if (status === 'needs implementation') return 'border-amber-500/40 text-amber-600 dark:text-amber-300';
  return 'border-red-500/40 text-red-600 dark:text-red-300';
}

function safeUploadName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'uploaded.txt';
}

function RuntimeAssetChecklist({
  agent,
  readOnly,
  onEditAssets,
  onCreateStub,
}: {
  agent: AgentConfig;
  readOnly: boolean;
  onEditAssets: (agent: AgentConfig) => void;
  onCreateStub: (agent: AgentConfig, requirementId: string) => void;
}) {
  const requirements = useMemo(() => deriveRuntimeAssetRequirements(agent), [agent]);
  const packageSummary = useMemo(() => normalizeRuntimePackage(agent.runtimePackage), [agent.runtimePackage]);
  const counts = {
    tools: packageSummary.tools.length,
    scripts: packageSummary.scripts.length,
    files: packageSummary.files.length,
  };

  return (
    <div className="mx-2 mb-1 rounded-md border border-sidebar-border bg-sidebar-accent/20 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground">
          <PackageCheck className="h-3 w-3" />
          <span className="truncate">Runtime attachments</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={(event) => {
            event.stopPropagation();
            onEditAssets(agent);
          }}
          disabled={readOnly}
        >
          Edit
        </Button>
      </div>

      {requirements.length === 0 ? (
        <div className="rounded border border-dashed border-sidebar-border px-2 py-2 text-[11px] text-muted-foreground">
          No graph tools or scripts detected. Package has {counts.tools} tools, {counts.scripts} scripts, {counts.files} files.
        </div>
      ) : (
        <div className="space-y-1.5">
          {requirements.map((requirement) => (
            <div key={requirement.id} className="rounded border border-sidebar-border/70 bg-background/30 px-2 py-1.5">
              <div className="flex items-start gap-1.5">
                {requirement.kind === 'tool' ? (
                  <Wrench className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                ) : requirement.kind === 'script' ? (
                  <FileCode2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[11px] font-medium">{requirement.name}</span>
                    <Badge variant="outline" className={cn('h-4 px-1 text-[9px]', statusBadgeClass(requirement.status))}>
                      {requirement.status}
                    </Badge>
                  </div>
                  {(requirement.matchedPath || requirement.sourcePath || requirement.command) && (
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {requirement.matchedPath || requirement.sourcePath || requirement.command}
                    </div>
                  )}
                </div>
              </div>
              {!readOnly && requirement.status !== 'attached' && (
                <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditAssets(agent);
                    }}
                  >
                    Attach code
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditAssets(agent);
                    }}
                  >
                    Upload file
                  </Button>
                  {requirement.kind === 'tool' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCreateStub(agent, requirement.id);
                      }}
                    >
                      Create stub
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuntimeAssetEditorDialog({
  agent,
  readOnly,
  onOpenChange,
  onSave,
}: {
  agent: AgentConfig | null;
  readOnly: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (agentId: string, runtimePackage: RuntimePackage) => void;
}) {
  const [runtimePackage, setRuntimePackage] = useState<RuntimePackage>(() => normalizeRuntimePackage({}));
  const [jsonText, setJsonText] = useState('');
  const [selectedAssetKey, setSelectedAssetKey] = useState('file:0');
  const [selectedToolIndex, setSelectedToolIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('code');
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const assetItems = useMemo(() => [
    ...runtimePackage.scripts.map((script, index) => ({
      key: `script:${index}`,
      kind: 'script' as const,
      label: script.path || script.name || `script-${index + 1}`,
      content: script.content,
    })),
    ...runtimePackage.files.map((file, index) => ({
      key: `file:${index}`,
      kind: 'file' as const,
      label: file.path || `file-${index + 1}`,
      content: file.content,
    })),
  ], [runtimePackage.files, runtimePackage.scripts]);

  const selectedAsset = useMemo(() => {
    const [kind, rawIndex] = selectedAssetKey.split(':');
    const index = Number(rawIndex);
    if (kind === 'script' && runtimePackage.scripts[index]) {
      return { kind: 'script' as const, index, value: runtimePackage.scripts[index] };
    }
    if (kind === 'file' && runtimePackage.files[index]) {
      return { kind: 'file' as const, index, value: runtimePackage.files[index] };
    }
    return null;
  }, [runtimePackage.files, runtimePackage.scripts, selectedAssetKey]);

  const selectedTool = runtimePackage.tools[selectedToolIndex] ?? null;

  useEffect(() => {
    if (!agent) return;
    const normalized = normalizeRuntimePackage(agent.runtimePackage);
    setRuntimePackage(normalized);
    setJsonText(JSON.stringify(normalized, null, 2));
    setSelectedAssetKey(normalized.scripts.length > 0 ? 'script:0' : 'file:0');
    setSelectedToolIndex(0);
    setError(null);
  }, [agent]);

  function estimateTokens(value: string) {
    return value.trim() ? Math.ceil(value.length / 4) : 0;
  }

  function applyPackage(value: RuntimePackage) {
    const normalized = normalizeRuntimePackage(value);
    setRuntimePackage(normalized);
    setJsonText(JSON.stringify(normalized, null, 2));
    setError(null);
  }

  function parseJsonPackage() {
    try {
      return normalizeRuntimePackage(JSON.parse(jsonText || '{}'));
    } catch {
      throw new Error('Runtime package JSON is invalid.');
    }
  }

  function updateTool(index: number, patch: Partial<RuntimeTool>) {
    applyPackage({
      ...runtimePackage,
      tools: runtimePackage.tools.map((tool, itemIndex) => itemIndex === index ? { ...tool, ...patch } : tool),
    });
  }

  function updateScript(index: number, patch: Partial<RuntimeScript>) {
    applyPackage({
      ...runtimePackage,
      scripts: runtimePackage.scripts.map((script, itemIndex) => itemIndex === index ? { ...script, ...patch } : script),
    });
  }

  function updateFile(index: number, patch: Partial<RuntimeFile>) {
    applyPackage({
      ...runtimePackage,
      files: runtimePackage.files.map((file, itemIndex) => itemIndex === index ? { ...file, ...patch } : file),
    });
  }

  function addTool() {
    const tool: RuntimeTool = {
      name: 'Python tool',
      command: 'python /sandbox/map/tools/tool.py',
      description: 'Python runtime tool',
      sourceType: 'manual',
      sourcePath: 'tools/tool.py',
      needsImplementation: true,
    };
    applyPackage({ ...runtimePackage, tools: [...runtimePackage.tools, tool] });
    setSelectedToolIndex(runtimePackage.tools.length);
    setActiveTab('tools');
  }

  function addScript() {
    const script: RuntimeScript = {
      name: 'Local runtime script',
      path: 'scripts/local_agent.py',
      content: '#!/usr/bin/env python3\n\nprint("ready")\n',
      runOnStart: false,
      sourceType: 'manual',
    };
    applyPackage({ ...runtimePackage, scripts: [...runtimePackage.scripts, script] });
    setSelectedAssetKey(`script:${runtimePackage.scripts.length}`);
    setActiveTab('code');
  }

  function addFile() {
    const file: RuntimeFile = {
      path: 'tools/tool.py',
      content: '#!/usr/bin/env python3\n\nprint("tool output")\n',
      sourceType: 'manual',
    };
    applyPackage({ ...runtimePackage, files: [...runtimePackage.files, file] });
    setSelectedAssetKey(`file:${runtimePackage.files.length}`);
    setActiveTab('code');
  }

  function deleteSelectedAsset() {
    if (!selectedAsset) return;
    if (selectedAsset.kind === 'script') {
      applyPackage({
        ...runtimePackage,
        scripts: runtimePackage.scripts.filter((_, index) => index !== selectedAsset.index),
      });
    } else {
      applyPackage({
        ...runtimePackage,
        files: runtimePackage.files.filter((_, index) => index !== selectedAsset.index),
      });
    }
    setSelectedAssetKey('file:0');
  }

  function deleteSelectedTool() {
    applyPackage({
      ...runtimePackage,
      tools: runtimePackage.tools.filter((_, index) => index !== selectedToolIndex),
    });
    setSelectedToolIndex(Math.max(0, selectedToolIndex - 1));
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const nextFiles = [...runtimePackage.files];
      for (const file of Array.from(files)) {
        if (file.size > ASSET_TEXT_LIMIT) {
          throw new Error(`${file.name} is larger than ${ASSET_TEXT_LIMIT.toLocaleString()} characters.`);
        }
        const content = await file.text();
        if (content.includes('\0')) throw new Error(`${file.name} does not look like a text file.`);
        const path = `files/${safeUploadName(file.name)}`;
        const nextFile = { path, content, sourceType: 'manual' as const };
        const existingIndex = nextFiles.findIndex((item) => item.path === path);
        if (existingIndex === -1) nextFiles.push(nextFile);
        else nextFiles[existingIndex] = nextFile;
      }
      applyPackage({ ...runtimePackage, files: nextFiles });
      setSelectedAssetKey(`file:${Math.max(0, nextFiles.length - 1)}`);
      setActiveTab('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file.');
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }

  function handleSave() {
    if (!agent) return;
    try {
      onSave(agent.id, activeTab === 'json' ? parseJsonPackage() : runtimePackage);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Runtime package JSON is invalid.');
    }
  }

  return (
    <Dialog open={!!agent} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,900px)] w-[min(96vw,1280px)] !max-w-[min(96vw,1280px)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <PackageCheck className="h-4 w-4" />
            Runtime Assets
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit graph-owned runtime scripts, tools, files, and package metadata.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => handleUpload(event.target.files)}
          />
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="code">Scripts & files</TabsTrigger>
                <TabsTrigger value="tools">Tools</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              <div className="text-xs text-muted-foreground">
                ~{estimateTokens(JSON.stringify(runtimePackage)).toLocaleString()} package tokens
              </div>
            </div>

            <TabsContent value="code" className="mt-0 grid min-h-0 flex-1 grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-3 overflow-hidden">
              <div className="flex min-h-0 flex-col rounded-md border border-border bg-muted/20">
                <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                  <Label className="text-xs">Package code</Label>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={readOnly} onClick={addScript} title="Add script">
                      <FileCode2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={readOnly} onClick={addFile} title="Add file">
                      <PlusCircle className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={readOnly} onClick={() => uploadInputRef.current?.click()} title="Upload text">
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-1 p-2">
                    {assetItems.length === 0 ? (
                      <div className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No scripts or files yet.
                      </div>
                    ) : assetItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setSelectedAssetKey(item.key)}
                        className={cn(
                          'w-full rounded border px-2 py-2 text-left text-xs transition-colors',
                          selectedAssetKey === item.key ? 'border-primary/50 bg-primary/10' : 'border-border/60 bg-background/50 hover:bg-muted/50',
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {item.kind === 'script' ? <FileCode2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                          <span className="truncate font-medium">{item.label}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">~{estimateTokens(item.content).toLocaleString()} tokens</div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="min-h-0 overflow-hidden rounded-md border border-border bg-background">
                {selectedAsset ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="space-y-3 border-b border-border p-3">
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <div className="min-w-0 space-y-1">
                          <Label className="text-xs">Path</Label>
                          <Input
                            value={selectedAsset.value.path}
                            onChange={(event) => selectedAsset.kind === 'script'
                              ? updateScript(selectedAsset.index, { path: event.target.value })
                              : updateFile(selectedAsset.index, { path: event.target.value })}
                            readOnly={readOnly}
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                        <Button size="sm" variant="ghost" className="mt-5 text-destructive" disabled={readOnly} onClick={deleteSelectedAsset}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {selectedAsset.kind === 'script' && (
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                          <div className="min-w-0 space-y-1">
                            <Label className="text-xs">Script name</Label>
                            <Input
                              value={(selectedAsset.value as RuntimeScript).name}
                              onChange={(event) => updateScript(selectedAsset.index, { name: event.target.value })}
                              readOnly={readOnly}
                              className="h-8 text-xs"
                            />
                          </div>
                          <label className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
                            <Checkbox
                              checked={(selectedAsset.value as RuntimeScript).runOnStart === true}
                              disabled={readOnly}
                              onCheckedChange={(checked) => updateScript(selectedAsset.index, { runOnStart: checked === true })}
                            />
                            Run on start
                          </label>
                        </div>
                      )}
                    </div>
                    <Textarea
                      value={selectedAsset.value.content}
                      onChange={(event) => selectedAsset.kind === 'script'
                        ? updateScript(selectedAsset.index, { content: event.target.value })
                        : updateFile(selectedAsset.index, { content: event.target.value })}
                      className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs leading-5 focus-visible:ring-0"
                      spellCheck={false}
                      wrap="off"
                      readOnly={readOnly}
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Select or add a script/file.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tools" className="mt-0 grid min-h-0 flex-1 grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-3 overflow-hidden">
              <div className="flex min-h-0 flex-col rounded-md border border-border bg-muted/20">
                <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                  <Label className="text-xs">Tools</Label>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={readOnly} onClick={addTool} title="Add tool">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-1 p-2">
                    {runtimePackage.tools.length === 0 ? (
                      <div className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">No tools yet.</div>
                    ) : runtimePackage.tools.map((tool, index) => (
                      <button
                        key={`${tool.name}-${index}`}
                        type="button"
                        onClick={() => setSelectedToolIndex(index)}
                        className={cn(
                          'w-full rounded border px-2 py-2 text-left text-xs transition-colors',
                          selectedToolIndex === index ? 'border-primary/50 bg-primary/10' : 'border-border/60 bg-background/50 hover:bg-muted/50',
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <Wrench className="h-3.5 w-3.5" />
                          <span className="truncate font-medium">{tool.name}</span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{tool.command}</div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="min-h-0 overflow-auto rounded-md border border-border bg-background p-3">
                {selectedTool ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Tool name</Label>
                        <Input value={selectedTool.name} onChange={(event) => updateTool(selectedToolIndex, { name: event.target.value })} readOnly={readOnly} />
                      </div>
                      <Button size="sm" variant="ghost" className="mt-5 text-destructive" disabled={readOnly} onClick={deleteSelectedTool}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Command</Label>
                      <Input className="font-mono text-xs" value={selectedTool.command} onChange={(event) => updateTool(selectedToolIndex, { command: event.target.value })} readOnly={readOnly} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Source path</Label>
                      <Input className="font-mono text-xs" value={selectedTool.sourcePath ?? ''} onChange={(event) => updateTool(selectedToolIndex, { sourcePath: event.target.value })} readOnly={readOnly} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Textarea value={selectedTool.description ?? ''} onChange={(event) => updateTool(selectedToolIndex, { description: event.target.value })} readOnly={readOnly} className="min-h-24 text-xs" />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={selectedTool.needsImplementation === true}
                        disabled={readOnly}
                        onCheckedChange={(checked) => updateTool(selectedToolIndex, { needsImplementation: checked === true })}
                      />
                      Needs implementation
                    </label>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Select or add a tool.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="json" className="mt-0 flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <Label className="text-xs">Raw package JSON</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Advanced edits for env, ports, connections, and security notes.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={readOnly}
                  onClick={() => {
                    try {
                      applyPackage(parseJsonPackage());
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Runtime package JSON is invalid.');
                    }
                  }}
                >
                  Apply JSON
                </Button>
              </div>
              <Textarea
                value={jsonText}
                onChange={(event) => {
                  setJsonText(event.target.value);
                  setError(null);
                }}
                className="min-h-0 flex-1 resize-none font-mono text-xs leading-5"
                spellCheck={false}
                wrap="off"
                readOnly={readOnly}
              />
            </TabsContent>
          </Tabs>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={readOnly}>Save assets</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AgentTreeProps {
  agents: AgentConfig[];
  selectedAgentId?: string;
  onSelectAgent: (agentId: string) => void;
  onCreateAgent: () => void;
  onDeleteAgent: (agentId: string) => void;
  onUpdateRuntimePackage?: (agentId: string, runtimePackage: RuntimePackage) => void;
  onExportAgent: (agentId: string) => void;
  onImportAgent: () => void;
  isTextMode: boolean;
  onToggleTextMode: () => void;
  textContent: string;
  onTextChange: (text: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  selectedNodeId?: string;
  demoAgent?: AgentConfig;
  demoAgents?: AgentConfig[];
  generationJob?: GenerationJob | null;
  onDismissGenerationJob?: () => void;
  multiAgentJob?: MultiAgentJob | null;
  onDismissMultiAgentJob?: () => void;
}

export function AgentTree({
  agents,
  selectedAgentId,
  onSelectAgent,
  onCreateAgent,
  onDeleteAgent,
  onUpdateRuntimePackage,
  onExportAgent,
  onImportAgent,
  isTextMode,
  onToggleTextMode,
  textContent,
  onTextChange,
  onNodeHover,
  selectedNodeId,
  demoAgent,
  demoAgents,
  generationJob,
  onDismissGenerationJob,
  multiAgentJob,
  onDismissMultiAgentJob,
}: AgentTreeProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());
  const [assetEditorAgent, setAssetEditorAgent] = useState<AgentConfig | null>(null);

  const editableAgentIds = useMemo(() => new Set(agents.map((agent) => agent.id)), [agents]);
  const exampleAgents = useMemo(
    () => [demoAgent, ...(demoAgents ?? [])].filter(Boolean) as AgentConfig[],
    [demoAgent, demoAgents],
  );

  const toggleFamily = (masterId: string) => {
    setCollapsedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(masterId)) next.delete(masterId);
      else next.add(masterId);
      return next;
    });
  };

  const toggleAssets = (agentId: string) => {
    setExpandedAssets(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  const handleCreateToolStub = (agent: AgentConfig, requirementId: string) => {
    if (!onUpdateRuntimePackage) return;
    const requirement = deriveRuntimeAssetRequirements(agent).find((item) => item.id === requirementId);
    if (!requirement || requirement.kind !== 'tool') return;
    const currentPackage = normalizeRuntimePackage(agent.runtimePackage);
    const sourcePath = requirement.sourcePath || runtimeToolPath(requirement.name);
    const nextTool = {
      name: requirement.name,
      command: requirement.command || runtimeToolCommand(requirement.name),
      description: requirement.description,
      sourceType: 'graph' as const,
      sourceNodeId: requirement.sourceNodeId,
      sourcePath,
      needsImplementation: true,
    };
    const tools = currentPackage.tools.some((tool) => tool.sourceNodeId === requirement.sourceNodeId || tool.name === requirement.name)
      ? currentPackage.tools.map((tool) => tool.sourceNodeId === requirement.sourceNodeId || tool.name === requirement.name ? { ...tool, ...nextTool } : tool)
      : [...currentPackage.tools, nextTool];
    const stubFile = runtimeToolStub(nextTool);
    const files = currentPackage.files.some((file) => file.path === stubFile.path)
      ? currentPackage.files
      : [...currentPackage.files, stubFile];
    onUpdateRuntimePackage(agent.id, normalizeRuntimePackage({ ...currentPackage, tools, files }));
  };

  const renderAssetToggle = (agent: AgentConfig) => (
    <Button
      size="icon"
      variant="ghost"
      className="h-6 w-6 text-muted-foreground hover:text-foreground"
      title="Runtime attachments"
      onClick={(event) => {
        event.stopPropagation();
        toggleAssets(agent.id);
      }}
    >
      {expandedAssets.has(agent.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
    </Button>
  );

  const renderAssetChecklist = (agent: AgentConfig) => expandedAssets.has(agent.id) ? (
    <RuntimeAssetChecklist
      agent={agent}
      readOnly={!onUpdateRuntimePackage || !editableAgentIds.has(agent.id)}
      onEditAssets={setAssetEditorAgent}
      onCreateStub={handleCreateToolStub}
    />
  ) : null;

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (agent.agentRole || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group agents into families and standalone
  const { families, standalone } = (() => {
    const masterIds = new Set(
      filteredAgents.filter(a => a.childAgentIds?.length).map(a => a.id)
    );
    const childParentMap = new Map(
      filteredAgents.filter(a => a.parentAgentId).map(a => [a.id, a.parentAgentId!])
    );

    const familyMap = new Map<string, { master: AgentConfig; children: AgentConfig[] }>();
    const standaloneList: AgentConfig[] = [];

    for (const agent of filteredAgents) {
      if (masterIds.has(agent.id)) {
        if (!familyMap.has(agent.id)) {
          familyMap.set(agent.id, { master: agent, children: [] });
        } else {
          familyMap.get(agent.id)!.master = agent;
        }
      } else if (childParentMap.has(agent.id)) {
        const parentId = childParentMap.get(agent.id)!;
        if (!familyMap.has(parentId)) {
          // Parent not in filtered list but child is — show as standalone
          standaloneList.push(agent);
        } else {
          familyMap.get(parentId)!.children.push(agent);
        }
      } else {
        standaloneList.push(agent);
      }
    }

    return {
      families: Array.from(familyMap.values()),
      standalone: standaloneList,
    };
  })();

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-sidebar border-r border-sidebar-border" style={{ minWidth: 220 }}>
      <div className="p-4 border-b border-sidebar-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-sidebar-foreground flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Agents
          </h2>
          <div className="flex gap-1">
            <Button
              variant={isTextMode ? "default" : "ghost"}
              className={cn(
                "h-7 gap-1.5 px-2 transition-all border border-orange-500/50 rounded-lg",
                isTextMode ? "bg-orange-600 hover:bg-orange-700 text-white shadow-sm border-orange-400" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              )}
              onClick={onToggleTextMode}
              title={isTextMode ? "Switch to Graph Mode" : "View AI System Prompt"}
            >
              {isTextMode ? <Network className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              <span className="text-[10px] font-bold uppercase tracking-tight">
                {isTextMode ? "Show Graph" : "Show Prompt"}
              </span>
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onImportAgent}>
              <Upload className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 px-2 bg-orange-600 hover:bg-orange-700 text-white border-0 shadow-sm"
              onClick={onCreateAgent}
            >
              <Plus className="h-3 w-3 stroke-[3px]" />
              <span className="text-[10px] font-bold uppercase tracking-tight">New</span>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-sidebar-accent border-sidebar-border"
          />
        </div>
      </div>

      {/* Progress section */}
      {(generationJob || multiAgentJob) && (
        <div className="shrink-0 max-h-[40%] flex flex-col">
          <ScrollArea className="flex-1">
            {/* Background generation notification */}
            {generationJob && (
              <div className={cn(
                'mx-3 mt-2 mb-1 rounded-md px-3 py-2 text-xs flex items-start gap-2',
                generationJob.status === 'running' && 'bg-primary/10 text-primary',
                generationJob.status === 'done' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                generationJob.status === 'error' && 'bg-destructive/10 text-destructive',
              )}>
                <div className="flex-shrink-0 mt-0.5">
                  {generationJob.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {generationJob.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {generationJob.status === 'error' && <XCircle className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  {generationJob.status === 'running' && (
                    <>
                      <p className="font-medium leading-snug">Generating graph…</p>
                      {generationJob.phaseLabel && (
                        <p className="text-[10px] text-primary opacity-90 mt-0.5 font-mono">
                          {generationJob.phaseLabel}
                        </p>
                      )}
                      {generationJob.charCount != null && generationJob.charCount > 0 && (
                        <p className="text-[10px] opacity-70 mt-0.5 font-mono">
                          {generationJob.charCount.toLocaleString()} chars received
                        </p>
                      )}
                      {generationJob.tokenCount?.totalTokens != null && generationJob.tokenCount.totalTokens > 0 && (
                        <p className="text-[10px] opacity-70 mt-0.5 font-mono">
                          {generationJob.tokenCount.totalTokens.toLocaleString()} tokens
                          {(generationJob.tokenCount.promptTokens || generationJob.tokenCount.responseTokens) && (
                            <> ({generationJob.tokenCount.promptTokens?.toLocaleString() ?? '?'} prompt in + {generationJob.tokenCount.responseTokens?.toLocaleString() ?? '?'} out)</>
                          )}
                        </p>
                      )}
                    </>
                  )}
                  {generationJob.status === 'done' && (
                    <>
                      <p className="font-medium leading-snug">Graph ready</p>
                      {generationJob.tokenCount?.totalTokens != null && generationJob.tokenCount.totalTokens > 0 && (
                        <p className="text-[10px] opacity-70 mt-0.5 font-mono">
                          {generationJob.tokenCount.totalTokens.toLocaleString()} tokens used
                          {generationJob.tokenCount.thoughtsTokens ? ` (${generationJob.tokenCount.thoughtsTokens.toLocaleString()} thinking)` : ''}
                        </p>
                      )}
                    </>
                  )}
                  {generationJob.status === 'error' && (
                    <p className="font-medium leading-snug">Generation failed</p>
                  )}
                  {generationJob.status !== 'running' && (
                    <p className="truncate text-[10px] opacity-70 mt-0.5">{generationJob.error ?? generationJob.prompt}</p>
                  )}
                </div>
                {generationJob.status === 'running' && generationJob.abort && (
                  <button
                    onClick={generationJob.abort}
                    className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity text-destructive"
                    aria-label="Stop generation"
                    title="Stop generation"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                )}
                {generationJob.status !== 'running' && (
                  <button
                    onClick={onDismissGenerationJob}
                    className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                    aria-label="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {/* Multi-agent generation progress panel */}
            {multiAgentJob && (
              <div className="mx-3 mt-2 mb-1 rounded-md border border-border bg-muted/30 text-xs overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {multiAgentJob.status === 'running' ? 'Generating multi-agent system…' :
                        multiAgentJob.status === 'done' ? 'Multi-agent system ready' :
                          'Generation failed'}
                    </span>
                  </div>
                  {multiAgentJob.status !== 'running' && (
                    <button
                      onClick={onDismissMultiAgentJob}
                      className="opacity-60 hover:opacity-100 transition-opacity"
                      aria-label="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="p-2 space-y-1">
                  {multiAgentJob.agents.map((ap, i) => (
                    <div key={ap.role} className="flex items-center gap-2 px-2 py-1 rounded">
                      {ap.status === 'done' && <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-500" />}
                      {ap.status === 'generating' && <Loader2 className="h-3 w-3 flex-shrink-0 text-blue-500 animate-spin" />}
                      {ap.status === 'error' && <XCircle className="h-3 w-3 flex-shrink-0 text-destructive" />}
                      {ap.status === 'pending' && (
                        <span className="h-3 w-3 flex-shrink-0 rounded-full border border-muted-foreground inline-block" />
                      )}
                      {i === 0
                        ? <Crown className="h-2.5 w-2.5 flex-shrink-0 text-orange-500" />
                        : <Bot className="h-2.5 w-2.5 flex-shrink-0 text-blue-400" />
                      }
                      <span className={cn(
                        'truncate flex-1',
                        ap.status === 'done' && 'text-green-700 dark:text-green-400',
                        ap.status === 'generating' && 'text-blue-700 dark:text-blue-400 font-medium',
                        ap.status === 'error' && 'text-destructive',
                        ap.status === 'pending' && 'text-muted-foreground',
                      )}>
                        {ap.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {isTextMode ? (
          <TextEditor
            content={textContent}
            onChange={onTextChange}
            selectedNodeId={selectedNodeId}
            onNodeHover={onNodeHover}
          />
        ) : (
          <div className="p-2 space-y-1">
            {/* Built-in examples are read-only until copied/imported. */}
            {exampleAgents.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-2 py-1">
                  <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Example</span>
                </div>
                {exampleAgents.map((exampleAgent) => (
                  <div key={exampleAgent.id}>
                    <div
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                        selectedAgentId === exampleAgent.id
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                      )}
                      onClick={() => onSelectAgent(exampleAgent.id)}
                    >
                      <FileJson className="h-4 w-4 flex-shrink-0 text-orange-400" />
                      <span className="flex-1 min-w-0 truncate text-xs">{exampleAgent.name}</span>
                      {renderAssetToggle(exampleAgent)}
                      <div title="Read-only demo" className="flex-shrink-0">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                    {renderAssetChecklist(exampleAgent)}
                  </div>
                ))}
              </>
            )}
            {/* Master Orchestrator demo family remains hidden */}
            <div className="my-1 border-t border-sidebar-border" />

            {/* Multi-agent families */}
            {families.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-2 py-1">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Multi-Agent Systems</span>
                </div>
                {families.map(({ master, children }) => {
                  const isCollapsed = collapsedFamilies.has(master.id);
                  return (
                    <div key={master.id}>
                      {/* Master row */}
                      <div
                        className={cn(
                          'group flex items-center gap-1.5 min-w-0 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                          selectedAgentId === master.id
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                        )}
                        onClick={() => onSelectAgent(master.id)}
                      >
                        <button
                          className="flex-shrink-0 p-0.5 hover:bg-sidebar-accent rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFamily(master.id);
                          }}
                        >
                          {isCollapsed
                            ? <ChevronRight className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />
                          }
                        </button>
                        <Crown className="h-3.5 w-3.5 flex-shrink-0 text-orange-500" />
                        <span className="flex-1 min-w-0 truncate text-xs font-medium">
                          {master.agentRole || master.name}
                        </span>
                        <div className="flex-shrink-0 flex items-center gap-1">
                          {master.sourceFormat && (
                            <span className={cn(
                              "px-1 rounded-[2px] text-[9px] font-bold uppercase",
                              master.sourceFormat === 'yaml' ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                                master.sourceFormat === 'json-compact' ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                                  "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            )}>
                              {master.sourceFormat === 'json-compact' ? 'COMPACT' : master.sourceFormat}
                            </span>
                          )}
                          {renderAssetToggle(master)}
                          <span className="text-[10px] text-muted-foreground">
                            {children.length} sub
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(master.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {renderAssetChecklist(master)}

                      {/* Children rows */}
                      {!isCollapsed && children.map(child => (
                        <div key={child.id}>
                          <div
                            className={cn(
                              'group flex items-center gap-2 min-w-0 rounded-md pl-7 pr-2 py-1 text-sm cursor-pointer transition-colors',
                              selectedAgentId === child.id
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                            )}
                            onClick={() => onSelectAgent(child.id)}
                          >
                            <div className="w-px h-4 bg-border -ml-1.5 flex-shrink-0" />
                            <Bot className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
                            <span className="flex-1 min-w-0 truncate text-xs">
                              {child.agentRole || child.name}
                            </span>
                            <div className="flex-shrink-0 flex items-center gap-1">
                              {child.sourceFormat && (
                                <span className={cn(
                                  "px-1 rounded-[2px] text-[9px] font-bold uppercase",
                                  child.sourceFormat === 'yaml' ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                                    child.sourceFormat === 'json-compact' ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                                      "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                )}>
                                  {child.sourceFormat === 'json-compact' ? 'COMPACT' : child.sourceFormat}
                                </span>
                              )}
                              {renderAssetToggle(child)}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(child.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {renderAssetChecklist(child)}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {standalone.length > 0 && (
                  <div className="my-1 border-t border-sidebar-border" />
                )}
              </>
            )}

            {/* Standalone agents */}
            {(standalone.length > 0 || families.length === 0) && (
              <div className="flex items-center gap-2 px-2 py-1">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Agents</span>
              </div>
            )}
            {standalone.length === 0 && families.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                {searchQuery ? 'No agents found' : 'No agents yet. Create one to get started.'}
              </div>
            ) : (
              standalone.map((agent, idx) => (
                <div key={`${agent.id}-${idx}`}>
                  <div
                    className={cn(
                      'group flex items-center gap-2 min-w-0 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                      selectedAgentId === agent.id
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                    )}
                    onClick={() => onSelectAgent(agent.id)}
                  >
                    <FileJson className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-xs">{agent.agentRole || agent.name}</span>
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {agent.sourceFormat && (
                        <span className={cn(
                          "px-1 rounded-[2px] text-[9px] font-bold uppercase",
                          agent.sourceFormat === 'yaml' ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                            agent.sourceFormat === 'json-compact' ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                              "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        )}>
                          {agent.sourceFormat === 'json-compact' ? 'COMPACT' : agent.sourceFormat}
                        </span>
                      )}
                      {renderAssetToggle(agent)}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(agent.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {renderAssetChecklist(agent)}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <RuntimeAssetEditorDialog
        agent={assetEditorAgent}
        readOnly={!assetEditorAgent || !onUpdateRuntimePackage || !editableAgentIds.has(assetEditorAgent.id)}
        onOpenChange={(open) => {
          if (!open) setAssetEditorAgent(null);
        }}
        onSave={(agentId, runtimePackage) => {
          onUpdateRuntimePackage?.(agentId, runtimePackage);
        }}
      />

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this agent? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId) {
                  onDeleteAgent(deleteConfirmId);
                  setDeleteConfirmId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface TextEditorProps {
  content: string;
  onChange: (text: string) => void;
  selectedNodeId?: string;
  onNodeHover?: (nodeId: string | null) => void;
}

function TextEditor({ content, onChange, selectedNodeId, onNodeHover }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedNodeId) {
      const mappings = getNodeLineMapping(content);
      const mapping = mappings.find(m => m.nodeId === selectedNodeId);

      if (mapping && textareaRef.current) {
        const textarea = textareaRef.current;
        const lines = content.split('\n');
        const charPosition = lines.slice(0, mapping.startLine).join('\n').length + (mapping.startLine > 0 ? 1 : 0);

        textarea.focus();
        textarea.setSelectionRange(charPosition, charPosition);
        textarea.scrollTop = (mapping.startLine * 20);
      }
    }
  }, [selectedNodeId, content]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!textareaRef.current || !onNodeHover) return;

    const textarea = textareaRef.current;
    const rect = textarea.getBoundingClientRect();
    const y = e.clientY - rect.top + textarea.scrollTop;
    const lineHeight = 20;
    const lineNumber = Math.floor(y / lineHeight);

    const mappings = getNodeLineMapping(content);
    const hoveredMapping = mappings.find(
      m => lineNumber >= m.startLine && lineNumber <= m.endLine
    );

    const newHoveredId = hoveredMapping?.nodeId || null;
    if (newHoveredId !== hoveredNodeId) {
      setHoveredNodeId(newHoveredId);
      onNodeHover(newHoveredId);
    }
  };

  const handleMouseLeave = () => {
    if (onNodeHover) {
      onNodeHover(null);
      setHoveredNodeId(null);
    }
  };

  const renderHighlightedText = () => {
    const mappings = getNodeLineMapping(content);
    const lines = content.split('\n');

    return lines.map((line, index) => {
      const mapping = mappings.find(
        m => index >= m.startLine && index <= m.endLine
      );

      const isHovered = mapping && mapping.nodeId === hoveredNodeId;
      const isSelected = mapping && mapping.nodeId === selectedNodeId;

      return (
        <div
          key={index}
          className={cn(
            'px-3 transition-colors',
            isHovered && 'bg-yellow-500/20',
            isSelected && 'bg-primary/10'
          )}
          style={{ lineHeight: '20px', minHeight: '20px' }}
        >
          {line || ' '}
        </div>
      );
    });
  };

  return (
    <div className="p-4 relative">
      <div
        className="relative w-full h-[calc(100vh-200px)] border border-sidebar-border rounded-md overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={highlightRef}
          className="absolute inset-0 pointer-events-none text-xs font-mono text-transparent overflow-hidden"
        >
          {renderHighlightedText()}
        </div>
        <textarea
          ref={textareaRef}
          className="absolute inset-0 w-full h-full p-3 text-xs font-mono bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-primary rounded-md z-10"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Edit your agent in text format...&#10;&#10;Format:&#10;### [node-id] TYPE: Label&#10;Description&#10;⚠️ DANGEROUS: reason (optional)"
          style={{ lineHeight: '20px', color: 'inherit' }}
        />
      </div>
    </div>
  );
}

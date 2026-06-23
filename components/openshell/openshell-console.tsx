'use client'

import { useState } from 'react'
import { Loader2, Play, Terminal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cleanTerminalOutput } from '@/lib/terminal-output'

type ConsoleEntry = {
  id: string
  command: string
  output: string
  status: 'success' | 'error'
}

const QUICK_COMMANDS = [
  'openshell sandbox list',
  'openshell gateway list',
  'openshell --help',
]

export function OpenShellConsole() {
  const [command, setCommand] = useState('openshell sandbox list')
  const [entries, setEntries] = useState<ConsoleEntry[]>([])
  const [running, setRunning] = useState(false)

  async function runCommand(nextCommand = command) {
    const value = nextCommand.trim()
    if (!value) return
    setRunning(true)
    try {
      const res = await fetch('/api/openshell/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'OpenShell command failed')
      setEntries((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${prev.length}`,
          command: data.command ?? value,
          output: cleanTerminalOutput(data.output) || '(no output)',
          status: 'success',
        },
      ])
    } catch (err) {
      const message = cleanTerminalOutput(err instanceof Error ? err.message : 'OpenShell command failed')
      setEntries((prev) => [
        ...prev,
        { id: `${Date.now()}-${prev.length}`, command: value, output: message, status: 'error' },
      ])
      toast.error(message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold leading-none">OpenShell CLI</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Run OpenShell commands through the Docker deployment worker.
            </p>
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => setEntries([])} disabled={entries.length === 0}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </header>

      <div className="border-b border-border/50 px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {QUICK_COMMANDS.map((quick) => (
            <Button
              key={quick}
              size="sm"
              variant="outline"
              onClick={() => {
                setCommand(quick)
                runCommand(quick)
              }}
              disabled={running}
            >
              {quick}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-5">
          {entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              Run <span className="font-mono text-foreground">openshell sandbox list</span> to inspect active MAP sandboxes.
            </div>
          ) : entries.map((entry) => (
            <div key={entry.id} className="rounded-md border border-border/50 bg-card">
              <div className="border-b border-border/50 px-3 py-2 font-mono text-xs text-muted-foreground">
                $ {entry.command}
              </div>
              <pre className={`max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-relaxed ${
                entry.status === 'error' ? 'text-destructive' : ''
              }`}>
                {entry.output}
              </pre>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-border/50 p-4">
        <div className="flex gap-2">
          <Input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') runCommand()
            }}
            className="font-mono"
            placeholder="openshell sandbox list"
          />
          <Button onClick={() => runCommand()} disabled={running || !command.trim()}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

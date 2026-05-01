'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, Terminal, Cpu, Database, Layout } from 'lucide-react';

interface LogEntry {
    id: string;
    message: string;
    status: 'pending' | 'success';
    type: 'compiler' | 'runtime' | 'graph';
}

export function CompilationStatus() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isReady, setIsReady] = useState(false);
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        const initialLogs: LogEntry[] = [
            { id: '1', message: 'Initializing Tailwind v4.0 engine...', status: 'pending', type: 'compiler' },
            { id: '2', message: 'Compiling React Flow canvas modules...', status: 'pending', type: 'compiler' },
            { id: '3', message: 'Hydrating graph components...', status: 'pending', type: 'runtime' },
        ];
        setLogs(initialLogs);

        const sequence = async () => {
            // Step 1: Styles
            await new Promise(r => setTimeout(r, 800));
            setLogs(prev => prev.map(l => l.id === '1' ? { ...l, status: 'success' } : l));

            // Step 2: Canvas
            setLogs(prev => [...prev, { id: '4', message: 'Parsing AgentConfig schemas...', status: 'pending', type: 'runtime' }]);
            await new Promise(r => setTimeout(r, 600));
            setLogs(prev => prev.map(l => l.id === '2' ? { ...l, status: 'success' } : l));

            // Step 3: Initialization
            setLogs(prev => [...prev, { id: '5', message: 'Readying workspace environments...', status: 'pending', type: 'graph' }]);
            await new Promise(r => setTimeout(r, 1000));
            setLogs(prev => prev.map(l => l.id === '4' ? { ...l, status: 'success' } : l));
            setLogs(prev => prev.map(l => l.id === '5' ? { ...l, status: 'success' } : l));

            // Step 4: Finalization
            setLogs(prev => prev.map(l => l.id === '3' ? { ...l, status: 'success' } : l));
            await new Promise(r => setTimeout(r, 400));
            setIsReady(true);
        };

        sequence();
    }, []);

    if (isReady && logs.every(l => l.status === 'success')) return null;

    return (
        <div className="fixed bottom-6 left-6 z-[100] w-80 pointer-events-none">
            <div className="bg-background/80 backdrop-blur-md border border-border rounded-xl shadow-2xl overflow-hidden p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Cpu className="w-4 h-4 text-primary animate-pulse" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">System Compilation</h3>
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="flex h-2 w-2 rounded-full bg-primary animate-ping" />
                        <span className="text-[10px] text-primary font-mono">LIVE</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <LogSequence logs={logs} />
                </div>

                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Compiling fragments...</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">
                        {logs.length > 0 ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100) : 0}%
                    </span>
                </div>
            </div>
        </div>
    );
}

function LogSequence({ logs }: { logs: LogEntry[] }) {
    return (
        <div className="space-y-2">
            <AnimatePresence>
                {logs.map((log) => (
                    <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-start gap-2.5"
                    >
                        {log.status === 'pending' ? (
                            <div className="mt-0.5"><Loader2 className="w-3 h-3 animate-spin text-primary" /></div>
                        ) : (
                            <div className="mt-0.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className={`text-[11px] leading-tight ${log.status === 'pending' ? 'text-foreground' : 'text-muted-foreground animate-out fade-out duration-1000'}`}>
                                {log.message}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[8px] px-1 bg-muted rounded uppercase font-bold text-muted-foreground/60 tracking-tighter">
                                    {log.type}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

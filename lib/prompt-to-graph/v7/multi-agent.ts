import type { AgentConfig } from '../../types';
import { buildSubAgentContext } from '../v1/multi-agent-context';
import { findBestRoleMatch } from '../v1/role-matching';
import { promptToGraphV7 } from './generate';
import type { V7Options } from './types';

// ── Prompt splitter ───────────────────────────────────────────────────────────

export interface AgentSection {
  role: string;
  prompt: string;
}

export interface SplitResult {
  master: AgentSection;
  subAgents: AgentSection[];
}

function extractRoleName(header: string): string {
  // "MASTER AGENT (ORCHESTRATOR)" → "ORCHESTRATOR"
  // "AGENT1 (RESEARCH AGENT)" → "RESEARCH AGENT"
  const parenMatch = header.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].trim();
  return header.replace(/^SYSTEM ROLE:\s*/i, '').replace(/^#{1,3}\s*/, '').replace(/^AGENT\d+\s*/i, '').trim();
}

function isMasterHeader(header: string): boolean {
  return /master|orchestrator|router|coordinator/i.test(header);
}

function splitByLines(
  prompt: string,
  lineMatchFn: (line: string) => string | null,
): SplitResult | null {
  const lines = prompt.split('\n');
  const sectionStarts: Array<{ lineIndex: number; header: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const header = lineMatchFn(lines[i]);
    if (header !== null) sectionStarts.push({ lineIndex: i, header });
  }

  if (sectionStarts.length < 2) return null;

  const sections: AgentSection[] = sectionStarts.map((sec, idx) => {
    const start = sec.lineIndex + 1;
    const end = idx + 1 < sectionStarts.length ? sectionStarts[idx + 1].lineIndex : lines.length;
    return {
      role: extractRoleName(sec.header),
      prompt: lines.slice(start, end).join('\n').trim(),
    };
  });

  const masterIdx = sectionStarts.findIndex(s => isMasterHeader(s.header));
  const mIdx = masterIdx === -1 ? 0 : masterIdx;
  const master = sections[mIdx];
  const subAgents = sections.filter((_, i) => i !== mIdx);

  if (subAgents.length === 0) return null;
  return { master, subAgents };
}

/**
 * Code-only multi-agent prompt splitter. Recognises 2 separator styles:
 *   1. "SYSTEM ROLE: NAME" lines
 *   2. "## NAME" headings where NAME contains agent/master/orchestrator keywords
 * Returns null if fewer than 2 agent sections are found.
 */
export function splitMultiAgentPrompt(rawPrompt: string): SplitResult | null {
  const prompt = rawPrompt.replace(/\r\n/g, '\n');

  // Strategy 1: SYSTEM ROLE: headers
  if (/^SYSTEM ROLE:/im.test(prompt)) {
    return splitByLines(prompt, line => {
      const m = line.match(/^SYSTEM ROLE:\s*(.+)$/i);
      return m ? m[1].trim() : null;
    });
  }

  // Strategy 2: ## headings where at least one contains agent/master/orchestrator/router keywords
  if (/^#{1,3}\s+[A-Z].*(AGENT|MASTER|ORCHESTRATOR|ROUTER)/im.test(prompt)) {
    // Collect all ## headings (any content), but only when there's a "master" heading present
    return splitByLines(prompt, line => {
      const m = line.match(/^#{1,3}\s+(.+)$/);
      return m ? m[1].trim() : null;
    });
  }

  return null;
}

// ── Multi-agent generation ────────────────────────────────────────────────────

export type AgentGenStatus = 'pending' | 'generating' | 'done' | 'error';

export interface AgentGenProgress {
  role: string;
  status: AgentGenStatus;
  error?: string;
}

export interface MultiAgentV7Options extends V7Options {
  onProgress?: (agents: AgentGenProgress[]) => void;
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/**
 * Detects and generates multi-agent graphs from a combined prompt using V7 DNA pipeline.
 * Returns null if the prompt is not a multi-agent prompt.
 * Same orchestration as V6: master first → sub-agents in parallel → link ag=agent nodes.
 */
export async function generateMultiAgentGraphsV7(
  rawPrompt: string,
  options: MultiAgentV7Options,
): Promise<{ master: AgentConfig; subAgents: AgentConfig[] } | null> {
  const split = splitMultiAgentPrompt(rawPrompt);
  if (!split) return null;

  const { master: masterSection, subAgents: subSections } = split;

  const v7Opts: V7Options = {
    apiKey: options.apiKey,
    model: options.model,
    graphStyle: options.graphStyle,
    signal: options.signal,
    onChunk: options.onChunk,
    onUsage: options.onUsage,
  };

  const progressState: AgentGenProgress[] = [
    { role: masterSection.role, status: 'generating' },
    ...subSections.map(s => ({ role: s.role, status: 'pending' as AgentGenStatus })),
  ];
  options.onProgress?.([...progressState]);

  // Generate master first
  const master = await promptToGraphV7(masterSection.prompt, {
    ...v7Opts,
    onPhaseChange: (phase, name, status) => {
      options.onPhaseChange?.(phase, `Master: ${name}`, status);
    },
  });
  master.agentRole = masterSection.role;
  master.childAgentIds = [];
  (master as any).generatedWith = 'v7';

  progressState[0] = { role: masterSection.role, status: 'done' };
  options.onProgress?.([...progressState]);

  if (options.signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');

  for (let i = 0; i < subSections.length; i++) {
    progressState[i + 1] = { role: subSections[i].role, status: 'generating' };
  }
  options.onProgress?.([...progressState]);

  const TIMEOUT_MS = 180_000;

  const generateOne = async (i: number): Promise<AgentConfig> => {
    const { role, prompt } = subSections[i];
    if (options.signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout generating ${role}`)), TIMEOUT_MS),
    );

    const subAgentContext = buildSubAgentContext(master, role, subSections.map(s => s.role));
    const augmentedPrompt = `${subAgentContext}\n\n---\n\n${prompt}`;

    const subAgent = await Promise.race([
      promptToGraphV7(augmentedPrompt, { ...v7Opts, onChunk: undefined }),
      timeoutPromise,
    ]);

    subAgent.originalPrompt = prompt;
    subAgent.agentRole = role;
    subAgent.parentAgentId = master.id;
    subAgent.name = `${role} Agent`;
    subAgent.id = `agent-${djb2(`${role}|${prompt.trim()}`)}`;
    (subAgent as any).generatedWith = 'v7';

    // Remove sibling agent nodes (prevent cross-contamination)
    const siblingRoles = subSections
      .filter(s => s.role.toUpperCase() !== role.toUpperCase())
      .map(s => s.role.toUpperCase());
    const siblingNodeIds = new Set(
      subAgent.nodes
        .filter(n => n.type === 'AGENT' && siblingRoles.some(sr =>
          ((n.config?.agentRole as string) || n.label || '').toUpperCase().includes(sr),
        ))
        .map(n => n.id),
    );
    if (siblingNodeIds.size > 0) {
      subAgent.nodes = subAgent.nodes.filter(n => !siblingNodeIds.has(n.id));
      subAgent.connections = subAgent.connections.filter(
        c => !siblingNodeIds.has(c.source) && !siblingNodeIds.has(c.target),
      );
    }

    progressState[i + 1] = { role, status: 'done' };
    options.onProgress?.([...progressState]);
    return subAgent;
  };

  const settled = await Promise.allSettled(subSections.map((_, i) => generateOne(i)));

  for (const r of settled) {
    if (r.status === 'rejected' && r.reason instanceof DOMException && r.reason.name === 'AbortError') {
      throw r.reason;
    }
  }

  const subAgents = settled
    .filter((r): r is PromiseFulfilledResult<AgentConfig> => r.status === 'fulfilled')
    .map(r => r.value);

  // Wire master childAgentIds
  for (const sub of subAgents) master.childAgentIds!.push(sub.id);

  // Link master ag=agent nodes to sub-agent IDs
  const subRoles = subAgents.map(s => s.agentRole || '');
  const linkedRoles = new Set<string>();

  for (const node of master.nodes) {
    if (node.type !== 'AGENT') continue;
    const available = subRoles.filter(r => !linkedRoles.has(r.toUpperCase()));
    const { bestMatch, confidence } = findBestRoleMatch(node.label, available);
    if (bestMatch && confidence >= 0.5) {
      const matched = subAgents.find(s => (s.agentRole || '').toUpperCase() === bestMatch.toUpperCase());
      if (matched) {
        node.config = { ...node.config, linkedAgentId: matched.id, agentRole: matched.agentRole, roleMatchConfidence: confidence };
        linkedRoles.add(bestMatch.toUpperCase());
      }
    }
  }

  return { master, subAgents };
}

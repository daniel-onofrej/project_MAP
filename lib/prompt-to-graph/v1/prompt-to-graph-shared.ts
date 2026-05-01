// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities for all prompt-to-graph generation modes.
// Re-exports from prompt-to-graph.ts + new markdown parser + post-processing runner.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentConfig, NodeData, Connection, GraphRuleSettings, NodeType } from '../../types';
import { getGraphRuleSettings } from '../../storage/storage';
import { validateAgentConfig } from '../../validation';
import {
  adaptPfgJsonToAgentConfig,
  normalizePromptText,
  mapPfgType,
  PFG_TYPE_MAP,
  cleanupEdges,
  autoWireDisconnectedNodes,
  autoInjectLoggingNodes,
} from './prompt-to-graph';

// Re-export for downstream consumers
export {
  adaptPfgJsonToAgentConfig,
  normalizePromptText,
  mapPfgType,
  PFG_TYPE_MAP,
  cleanupEdges,
  autoWireDisconnectedNodes,
  autoInjectLoggingNodes,
  getGraphRuleSettings,
};

// ─────────────────────────────────────────────────────────────────────────────
// ParsedSnippet: the output of the deterministic markdown parser.
// Each meaningful line becomes one snippet with full source metadata.
// ─────────────────────────────────────────────────────────────────────────────
export interface ParsedSnippet {
  text: string;            // Verbatim content (without bullet/number/heading markers)
  rawLine: string;         // Original line including markers
  sectionHeading: string;  // Current section heading (e.g., "## Rules" → "Rules")
  sourceFormat: 'heading' | 'bulleted_list' | 'numbered_list' | 'prose' | 'yaml_field' | 'table_row' | 'tab_table_row';
  indent: number;          // Leading whitespace count
  order: number;           // Global counter (1-based)
  isBlankBefore: boolean;  // Whether preceding line was blank
  lineIndex: number;       // 0-based line index in original prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown parser: splits a prompt into structured snippets.
// This is the deterministic "Phase 1" shared by Hybrid and Deterministic modes.
// ─────────────────────────────────────────────────────────────────────────────
export function parseMarkdownToSnippets(prompt: string): ParsedSnippet[] {
  const lines = prompt.split('\n');
  const snippets: ParsedSnippet[] = [];
  let currentSection = '';
  let order = 0;
  let inFrontmatter = false;
  let frontmatterStarted = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Track YAML frontmatter delimiters (---)
    if (trimmed === '---') {
      if (!frontmatterStarted) {
        frontmatterStarted = true;
        inFrontmatter = true;
      } else {
        inFrontmatter = false;
      }
      continue;
    }

    // Skip blank lines (but track for isBlankBefore)
    if (!trimmed) continue;

    const indent = raw.length - raw.trimStart().length;
    const isBlankBefore = i > 0 && lines[i - 1].trim() === '';

    // YAML frontmatter fields (key: value)
    if (inFrontmatter) {
      const yamlMatch = trimmed.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
      if (yamlMatch) {
        order++;
        snippets.push({
          text: trimmed,
          rawLine: raw,
          sectionHeading: 'Frontmatter',
          sourceFormat: 'yaml_field',
          indent, order, isBlankBefore, lineIndex: i,
        });
        continue;
      }
    }

    // Detect section headings (# Title, ## Section, etc.)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      currentSection = headingMatch[2].replace(/[*_`]/g, '').trim();
      order++;
      snippets.push({
        text: currentSection,
        rawLine: raw,
        sectionHeading: currentSection,
        sourceFormat: 'heading',
        indent, order, isBlankBefore, lineIndex: i,
      });
      continue;
    }

    // Detect bulleted list items (-, *, +)
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (bulletMatch) {
      order++;
      snippets.push({
        text: bulletMatch[1],
        rawLine: raw,
        sectionHeading: currentSection,
        sourceFormat: 'bulleted_list',
        indent, order, isBlankBefore, lineIndex: i,
      });
      continue;
    }

    // Detect numbered list items (1., 2., etc.)
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numberedMatch) {
      order++;
      snippets.push({
        text: numberedMatch[1],
        rawLine: raw,
        sectionHeading: currentSection,
        sourceFormat: 'numbered_list',
        indent, order, isBlankBefore, lineIndex: i,
      });
      continue;
    }

    // Detect table rows (tab-separated or pipe-separated)
    if (trimmed.includes('\t') && trimmed.split('\t').length >= 2) {
      order++;
      snippets.push({
        text: trimmed,
        rawLine: raw,
        sectionHeading: currentSection,
        sourceFormat: 'tab_table_row',
        indent, order, isBlankBefore, lineIndex: i,
      });
      continue;
    }
    if (trimmed.includes('|') && trimmed.split('|').filter(Boolean).length >= 2 && !trimmed.match(/^[-|:\s]+$/)) {
      order++;
      snippets.push({
        text: trimmed.replace(/^\||\|$/g, '').trim(),
        rawLine: raw,
        sectionHeading: currentSection,
        sourceFormat: 'table_row',
        indent, order, isBlankBefore, lineIndex: i,
      });
      continue;
    }

    // Default: prose
    order++;
    snippets.push({
      text: trimmed,
      rawLine: raw,
      sectionHeading: currentSection,
      sourceFormat: 'prose',
      indent, order, isBlankBefore, lineIndex: i,
    });
  }

  return snippets;
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing pipeline runner.
// Chains all post-processing steps in order, respecting GraphRuleSettings.
// ─────────────────────────────────────────────────────────────────────────────
export function applyPostProcessing(
  agentConfig: AgentConfig,
  originalPrompt: string,
  graphRules?: GraphRuleSettings
): AgentConfig {
  const rules = graphRules ?? getGraphRuleSettings();

  // 1. cleanupEdges — always
  agentConfig = {
    ...agentConfig,
    connections: cleanupEdges(agentConfig.nodes, agentConfig.connections),
  };

  // 2. autoWireDisconnectedNodes (if enabled)
  if (rules.autoWireDisconnected) {
    agentConfig = {
      ...agentConfig,
      connections: autoWireDisconnectedNodes(agentConfig.nodes, agentConfig.connections),
    };
  }

  // 3. autoInjectLoggingNodes (if outcome chains enabled)
  if (rules.structuredOutcomeChains) {
    const injected = autoInjectLoggingNodes(
      agentConfig.nodes,
      agentConfig.connections,
      originalPrompt
    );
    agentConfig = {
      ...agentConfig,
      nodes: injected.nodes,
      connections: injected.connections,
    };
  }

  // 4. validateAgentConfig (if enabled)
  if (rules.postParseValidation) {
    const violations = validateAgentConfig(agentConfig);
    if (violations.length > 0) {
      (agentConfig as any)._postParseViolations = violations;
    }
  }

  return agentConfig;
}

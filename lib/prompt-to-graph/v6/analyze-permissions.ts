// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V6 — Permissions Analyzer (Stage 3.5)
//
// Pure code, no LLM. Analyzes the final AgentConfig and emits a
// PermissionsManifest describing tools required, skills invoked,
// access categories, and risk level.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentConfig, PermissionsManifest, AccessCategory } from '../../types';

/**
 * Maps tool names to the access categories they require.
 */
const TOOL_PERMISSION_MAP: Record<string, AccessCategory[]> = {
  // Meta AI / Claude.ai tools
  'container.python_execution': ['shell', 'file-write'],
  'http://browser.search': ['network'],
  'meta_1p.content_search': ['network', 'external-api'],
  'media.create_image': ['external-api'],
  'media.animate_image': ['external-api'],
  'media.edit_image': ['external-api'],
  'media.create_video': ['external-api'],
  'media.edit_video': ['external-api'],
  'media.get_audio': ['external-api'],
  'media.get_reference_image': ['external-api'],
  // Claude Code native tools
  'Read': ['file-read'],
  'Write': ['file-write'],
  'Edit': ['file-write'],
  'Bash': ['shell'],
  'Glob': ['file-read'],
  'Grep': ['file-read'],
  'WebFetch': ['network'],
  'WebSearch': ['network'],
  'Agent': ['shell', 'network'], // subagents can do anything
};

/**
 * Known ECC (Execution Context) skill names to validate against.
 */
const KNOWN_ECC_SKILLS = new Set([
  'brainstorming',
  'tdd',
  'test-driven-development',
  'debugging',
  'systematic-debugging',
  'executing-plans',
  'writing-plans',
  'brainstorm',
  'finishing',
  'code-reviewer',
  'subagent-driven',
]);

/**
 * Checks if a skillRef loosely matches a known ECC skill name.
 */
function isKnownSkill(skillRef: string): boolean {
  const normalized = skillRef.toLowerCase().trim();
  for (const known of KNOWN_ECC_SKILLS) {
    if (normalized.includes(known) || known.includes(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Attempts to determine access categories for a tool.
 * First checks the exact mapping, then tries case-insensitive partial matching.
 */
function getAccessCategoriesForTool(tool: string): AccessCategory[] {
  // Check exact match first
  if (TOOL_PERMISSION_MAP[tool]) {
    return TOOL_PERMISSION_MAP[tool];
  }

  // Case-insensitive partial matching
  const lowerTool = tool.toLowerCase();

  if (lowerTool.includes('read')) {
    return ['file-read'];
  }
  if (lowerTool.includes('write') || lowerTool.includes('edit')) {
    return ['file-write'];
  }
  if (lowerTool.includes('bash') || lowerTool.includes('shell') || lowerTool.includes('exec')) {
    return ['shell'];
  }
  if (lowerTool.includes('web') || lowerTool.includes('http') || lowerTool.includes('fetch') || lowerTool.includes('search')) {
    return ['network'];
  }
  if (lowerTool.includes('git')) {
    return ['git'];
  }

  return ['unknown'];
}

/**
 * Checks if a tool name is a Claude Code native tool (simple name without dots or slashes).
 */
function isNativeClaudeCodeTool(tool: string): boolean {
  return !tool.includes('.') && !tool.includes('/');
}

/**
 * Analyzes the AgentConfig and produces a PermissionsManifest.
 */
export function analyzePermissions(config: AgentConfig): PermissionsManifest {
  // ─────────────────────────────────────────────────────────────────────────
  // Stage 1: Collect toolsRequired from TOOL nodes
  // ─────────────────────────────────────────────────────────────────────────
  const toolsRequired = new Set<string>();
  if (config.nodes) {
    for (const node of config.nodes) {
      if (node.type === 'TOOL') {
        const tool = node.config?.tool;
        if (tool && typeof tool === 'string' && tool.trim()) {
          toolsRequired.add(tool.trim());
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 2: Collect skillsInvoked from SKILL nodes
  // ─────────────────────────────────────────────────────────────────────────
  const skillsInvoked = new Set<string>();
  if (config.nodes) {
    for (const node of config.nodes) {
      if (node.type === 'SKILL') {
        const skillRef = node.config?.skillRef;
        if (skillRef && typeof skillRef === 'string' && skillRef.trim()) {
          skillsInvoked.add(skillRef.trim());
        } else {
          skillsInvoked.add('unknown');
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 3: Build accessCategories
  // ─────────────────────────────────────────────────────────────────────────
  const accessCategoriesSet = new Set<AccessCategory>();

  // From tools
  for (const tool of toolsRequired) {
    const categories = getAccessCategoriesForTool(tool);
    categories.forEach(cat => accessCategoriesSet.add(cat));
  }

  // From unknown skills
  for (const skill of skillsInvoked) {
    if (skill === 'unknown' || !isKnownSkill(skill)) {
      accessCategoriesSet.add('unknown');
    }
  }

  const accessCategories = Array.from(accessCategoriesSet).sort() as AccessCategory[];

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 4: Build allowedToolsFlag
  // ─────────────────────────────────────────────────────────────────────────
  const nativeTools = Array.from(toolsRequired).filter(isNativeClaudeCodeTool).sort();
  const allowedToolsFlag = nativeTools.length > 0
    ? `--allowedTools ${nativeTools.join(',')}`
    : '';

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 5: Build unknownScopeWarnings
  // ─────────────────────────────────────────────────────────────────────────
  const unknownScopeWarnings: string[] = [];
  for (const skill of skillsInvoked) {
    if (skill !== 'unknown' && !isKnownSkill(skill)) {
      unknownScopeWarnings.push(
        `Skill '${skill}' scope unknown — add to allowedTools if it uses file/shell access`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 6: Compute riskLevel
  // ─────────────────────────────────────────────────────────────────────────
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  if (
    accessCategories.includes('shell') ||
    unknownScopeWarnings.length >= 2
  ) {
    riskLevel = 'high';
  } else if (
    accessCategories.includes('file-write') ||
    accessCategories.includes('external-api')
  ) {
    riskLevel = 'medium';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 7: Return PermissionsManifest
  // ─────────────────────────────────────────────────────────────────────────
  return {
    toolsRequired: Array.from(toolsRequired).sort(),
    skillsInvoked: Array.from(skillsInvoked).sort(),
    accessCategories,
    allowedToolsFlag,
    unknownScopeWarnings,
    riskLevel,
  };
}

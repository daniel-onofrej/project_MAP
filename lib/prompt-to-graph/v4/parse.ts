// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V4 — Deterministic Paragraph Parser (Stage 0)
//
// Pure code, no LLM. Splits a prompt into numbered paragraphs (§N refs)
// grouped by section headings.
// ─────────────────────────────────────────────────────────────────────────────
import type { Ledger, Paragraph } from './types';

/** Normalize whitespace: collapse \r\n, trim trailing spaces per line. */
function normalize(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .trim();
}

/** Detect source format from content. */
function detectFormat(text: string): 'p' | 'h' | 'y' {
  const lines = text.split('\n');
  if (lines[0]?.trim() === '---' && lines.slice(1).some(l => l.trim() === '---')) return 'y';
  if (/^#{1,6}\s+/m.test(text)) return 'h';
  return 'p';
}

/** Regex matching a top-level bullet: `- `, `* `, or `1. ` with 0–1 leading spaces. */
const BULLET_RE = /^(\s{0,1})([-*]|\d+\.)\s+/;

/** Regex matching a sub-bullet or deeper indent (2+ leading spaces then bullet). */
const SUB_BULLET_RE = /^\s{2,}([-*]|\d+\.)\s+/;

/** True when `line` is a continuation of the previous bullet (indented, non-bullet). */
function isContinuation(line: string): boolean {
  return /^\s{2,}\S/.test(line) && !SUB_BULLET_RE.test(line);
}

/**
 * Split normalized text into fine-grained paragraphs.
 *
 * Canonical split rules:
 *   1. Each heading (## …)              → its own §N
 *   2. Each top-level bullet (- …)       → its own §N
 *      - Sub-bullets and continuation lines stay with parent bullet
 *   3. Consecutive non-bullet prose lines → one §N (split on blank lines)
 *
 * This gives the LLM a fine-grained §N per logical statement (each "If …",
 * each "Call …", each exception clause) so it can map them 1-to-1 to nodes.
 */
export function buildLedger(rawPrompt: string): Ledger {
  const prompt = normalize(rawPrompt);
  const lines = prompt.split('\n');
  const format = detectFormat(prompt);

  const paragraphs: Paragraph[] = [];
  let currentSection = 'Preamble';
  let buf: string[] = [];
  let inBullet = false;

  const flush = () => {
    if (buf.length === 0) return;
    const text = buf.join('\n');
    if (text.trim()) {
      paragraphs.push({
        ref: `§${paragraphs.length}`,
        index: paragraphs.length,
        text,
        section: currentSection,
      });
    }
    buf = [];
    inBullet = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Blank line → flush ─────────────────────────────────────────────────
    if (!trimmed) {
      flush();
      continue;
    }

    // ── Heading → own paragraph, update section ────────────────────────────
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentSection = headingMatch[2];
      buf.push(line);
      flush();
      continue;
    }

    // ── Top-level bullet → starts a new paragraph ─────────────────────────
    if (BULLET_RE.test(line) && !SUB_BULLET_RE.test(line)) {
      flush();
      buf.push(line);
      inBullet = true;
      continue;
    }

    // ── Sub-bullet or continuation → stays with current bullet ────────────
    if (inBullet && (SUB_BULLET_RE.test(line) || isContinuation(line))) {
      buf.push(line);
      continue;
    }

    // ── Regular prose line ─────────────────────────────────────────────────
    // If we were in a bullet, flush it first
    if (inBullet) flush();
    buf.push(line);
  }
  flush();

  const refs = paragraphs.filter(p => p.text.trim().length > 0).map(p => p.ref);

  return { prompt, paragraphs, refs, format };
}

/**
 * Format the ledger for the LLM as a readable table.
 * Each §N is shown with its section and text, making it clear
 * that each paragraph is an atomic unit to map 1:1 to a node.
 */
export function formatLedger(ledger: Ledger): string {
  return ledger.paragraphs
    .map(p => `${p.ref} [${p.section}] ${JSON.stringify(p.text)}`)
    .join('\n');
}

/**
 * Resolve §N refs to verbatim text, concatenated with newlines.
 */
export function resolveRefs(ledger: Ledger, refs: string[]): string {
  const indexMap = new Map(ledger.paragraphs.map(p => [p.ref, p]));
  return refs
    .map(ref => {
      // Handle ranges: §3-§7 or §3-7
      const rangeMatch = ref.match(/^§(\d+)-§?(\d+)$/);
      if (rangeMatch) {
        const from = parseInt(rangeMatch[1], 10);
        const to = parseInt(rangeMatch[2], 10);
        const parts: string[] = [];
        for (let n = Math.min(from, to); n <= Math.max(from, to); n++) {
          parts.push(indexMap.get(`§${n}`)?.text ?? '');
        }
        return parts.filter(Boolean).join('\n');
      }
      return indexMap.get(ref)?.text ?? '';
    })
    .filter(Boolean)
    .join('\n');
}

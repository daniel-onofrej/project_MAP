// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V6 — Deterministic Paragraph Parser (Stage 0)
//
// Ported from V5, unchanged.
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

function isPlainSectionHeading(trimmed: string): boolean {
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  if (!/^[A-Z]/.test(trimmed)) return false;
  if (/[.,;!?`'"\[\]{}()]/.test(trimmed)) return false;
  if (/\:\/\//.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 7) return false;
  return true;
}

const BULLET_RE = /^(\s{0,1})([-*]|\d+\.)\s+/;
const SUB_BULLET_RE = /^\s{2,}([-*]|\d+\.)\s+/;

function isContinuation(line: string): boolean {
  return /^\s{2,}\S/.test(line) && !SUB_BULLET_RE.test(line);
}

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

    if (!trimmed) {
      flush();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentSection = headingMatch[2];
      buf.push(line);
      flush();
      continue;
    }

    if (BULLET_RE.test(line) && !SUB_BULLET_RE.test(line)) {
      flush();
      buf.push(line);
      inBullet = true;
      continue;
    }

    if (inBullet && (SUB_BULLET_RE.test(line) || isContinuation(line))) {
      buf.push(line);
      continue;
    }

    if (buf.length === 0 && !inBullet && isPlainSectionHeading(trimmed)) {
      let nextNonBlank = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim()) { nextNonBlank = lines[j].trim(); break; }
      }
      const nextIsContent = nextNonBlank.length > 0 && !isPlainSectionHeading(nextNonBlank);
      if (nextIsContent) {
        buf.push(line);
        flush();
        currentSection = trimmed;
        continue;
      }
    }

    if (inBullet) flush();
    buf.push(line);
  }
  flush();

  const refs = paragraphs.filter(p => p.text.trim().length > 0).map(p => p.ref);

  return { prompt, paragraphs, refs, format };
}

export function formatLedger(ledger: Ledger): string {
  return ledger.paragraphs
    .map(p => `${p.ref} [${p.section}] ${JSON.stringify(p.text)}`)
    .join('\n');
}

export function resolveRefs(ledger: Ledger, refs: string[]): string {
  const indexMap = new Map(ledger.paragraphs.map(p => [p.ref, p]));
  return refs
    .map(ref => {
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

import type { DNAItem, DNARole } from './types';

const ABSOLUTE_RE = /\b(always|never|must|only|do not|don't|avoid|prohibit|require)\b/i;
const CONDITIONAL_RE = /^(if |when |unless |depending |in case )/i;
const PERSONA_RE = /^you are\b|^as (a|an)\b|^your role is\b/i;
const GOAL_RE = /^(your (?:goal|purpose|aim|objective|mission) is|deliver |produce )/i;
const EXAMPLE_RE = /^(example|e\.g\.|user:|→|->)/i;

const INPUT_SECTION_RE = /input|parameter|receive|specify|provide/i;
const OUTPUT_SECTION_RE = /output|format|guideline|result|response/i;

function splitIntoItems(raw: string): Array<{ text: string; section: string }> {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const items: Array<{ text: string; section: string }> = [];
  let section = 'Preamble';
  let buf: string[] = [];

  const flush = (sec: string) => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 2) items.push({ text, section: sec });
    buf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(section); continue; }

    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flush(section);
      section = headingMatch[1].trim();
      continue;
    }

    const bulletMatch = line.match(/^(\s{0,1})([-*]|\d+\.)\s+(.+)$/);
    if (bulletMatch) {
      flush(section);
      buf.push(bulletMatch[3]);
      flush(section);
      continue;
    }

    if (/^\s{2,}/.test(line) && buf.length > 0) {
      buf.push(trimmed);
      continue;
    }

    flush(section);
    buf.push(trimmed);
  }
  flush(section);
  return items;
}

function detectPickOneGroups(items: Array<{ text: string; section: string }>): Set<number> {
  const pickOneIndices = new Set<number>();
  const sectionGroups = new Map<string, number[]>();

  items.forEach((item, i) => {
    const list = sectionGroups.get(item.section) ?? [];
    list.push(i);
    sectionGroups.set(item.section, list);
  });

  for (const [, indices] of sectionGroups) {
    if (indices.length < 2) continue;
    const colonPattern = /^[A-Z][a-z].*:\s+/;
    const matching = indices.filter(i => colonPattern.test(items[i].text));
    if (matching.length >= 2) matching.forEach(i => pickOneIndices.add(i));
  }
  return pickOneIndices;
}

function classifyRole(text: string, section: string, isPickOne: boolean): DNARole {
  const t = text.trim();
  if (PERSONA_RE.test(t)) return 'persona';
  if (GOAL_RE.test(t) || section.toLowerCase().includes('goal')) return 'goal';
  if (EXAMPLE_RE.test(t) || section.toLowerCase().includes('example')) return 'example';
  if (CONDITIONAL_RE.test(t)) return 'decision';
  if (isPickOne) return 'style-option';
  if (INPUT_SECTION_RE.test(section)) return 'input-param';
  if (OUTPUT_SECTION_RE.test(section)) return 'output-format';
  if (ABSOLUTE_RE.test(t)) return 'rule';
  return 'behavior';
}

export function tagDNA(rawPrompt: string): DNAItem[] {
  const rawItems = splitIntoItems(rawPrompt);
  const pickOneIndices = detectPickOneGroups(rawItems);

  return rawItems.map((item, i) => {
    const isPickOne = pickOneIndices.has(i);
    const isConditional = CONDITIONAL_RE.test(item.text.trim());
    const isAbsolute = ABSOLUTE_RE.test(item.text);
    const role = classifyRole(item.text, item.section, isPickOne);

    return {
      id: `dna_${i}`,
      text: item.text,
      section: item.section,
      role,
      is_conditional: isConditional,
      is_pick_one: isPickOne,
      is_absolute: isAbsolute,
    };
  });
}

export function formatDNA(items: DNAItem[]): string {
  return items.map(item => {
    const flags: string[] = [item.role];
    if (item.is_conditional) flags.push('conditional');
    if (item.is_pick_one) flags.push('pick_one');
    if (item.is_absolute) flags.push('absolute');
    return `[${item.id}] ${flags.join('|')} | "${item.text}"`;
  }).join('\n');
}

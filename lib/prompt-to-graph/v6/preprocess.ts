// Prompt-to-Graph V6 — Pre-Processing (Stage -1)
// Strips YAML frontmatter and condenses code blocks before ledger parsing.

/**
 * Parses YAML frontmatter from the beginning of a raw text string.
 * Expects frontmatter to start at position 0 with `---` and end with a closing `---`.
 * Extracts simple key-value pairs (name, description, origin, compatibility).
 *
 * @param raw The raw input text
 * @returns An object with `meta` (extracted frontmatter) and `body` (remaining text)
 */
export function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  // Normalize line endings to \n for consistent processing
  const normalized = raw.replace(/\r\n/g, '\n');

  // Check if the text starts with frontmatter delimiter
  if (!normalized.startsWith('---\n')) {
    return { meta: {}, body: raw };
  }

  // Find the closing --- delimiter (skip the opening ---)
  const openingDelimiterEnd = 4; // length of "---\n"
  const closingDelimiterIndex = normalized.indexOf('\n---', openingDelimiterEnd);

  if (closingDelimiterIndex === -1) {
    // No closing delimiter found
    return { meta: {}, body: raw };
  }

  // Extract the frontmatter content (between the two ---)
  const frontmatterContent = normalized.substring(
    openingDelimiterEnd,
    closingDelimiterIndex
  );

  // Extract the body (everything after the closing ---)
  const bodyStart = closingDelimiterIndex + 5; // +5 to skip "\n---\n"
  const body = normalized.substring(bodyStart);

  // Parse frontmatter lines as key: value pairs
  const meta: Record<string, string> = {};
  const validKeys = ['name', 'description', 'origin', 'compatibility'];

  const lines = frontmatterContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim();
    if (!validKeys.includes(key)) continue;

    const value = trimmed.substring(colonIndex + 1).trim();
    meta[key] = value;
  }

  return { meta, body };
}

/**
 * Condenses fenced code blocks (triple backticks) into one-line summaries.
 * Preserves inline code (single backticks).
 *
 * @param text The text containing code blocks to condense
 * @returns Text with code blocks replaced by [CODE: lang — purpose] summaries
 */
export function condenseCodeBlocks(text: string): string {
  // Regex to match triple-backtick fenced code blocks
  // Captures: (language), (content)
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)\n```/g;

  return text.replace(codeBlockRegex, (match, lang, content) => {
    // Default language label if not specified
    const langLabel = lang || 'text';

    // Get the first non-blank line to infer purpose
    const lines = content.split('\n');
    let firstNonBlankLine = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        firstNonBlankLine = trimmed;
        break;
      }
    }

    let purpose = '';

    // Rule 1: Shebang (#!)
    if (firstNonBlankLine.startsWith('#!')) {
      purpose = `Run ${firstNonBlankLine.substring(2).trim()}`;
    }
    // Rule 2: Comment (// or #)
    else if (
      firstNonBlankLine.startsWith('//') ||
      firstNonBlankLine.startsWith('#')
    ) {
      const commentChar = firstNonBlankLine.startsWith('//') ? '//' : '#';
      purpose = firstNonBlankLine.substring(commentChar.length).trim();
    }
    // Rule 3: Function declaration
    else if (/^(async\s+)?function\s+(\w+)/.test(firstNonBlankLine)) {
      const match = firstNonBlankLine.match(/^(async\s+)?function\s+(\w+)/);
      if (match && match[2]) {
        purpose = `${match[2]} function`;
      }
    }
    // Rule 4: Class declaration
    else if (/^(export\s+)?(default\s+)?class\s+(\w+)/.test(firstNonBlankLine)) {
      const match = firstNonBlankLine.match(/^(export\s+)?(default\s+)?class\s+(\w+)/);
      if (match && match[3]) {
        purpose = `${match[3]} class`;
      }
    }
    // Rule 5: Const/variable definition
    else if (/^(export\s+)?const\s+(\w+)\s*=/.test(firstNonBlankLine)) {
      const match = firstNonBlankLine.match(/^(export\s+)?const\s+(\w+)\s*=/);
      if (match && match[2]) {
        purpose = `${match[2]} definition`;
      }
    }
    // Rule 6: Shell/bash language
    else if (langLabel === 'bash' || langLabel === 'sh') {
      purpose = 'Run shell command';
    }
    // Rule 7: Fallback
    else {
      purpose = 'Code block';
    }

    return `[CODE: ${langLabel} — ${purpose}]`;
  });
}

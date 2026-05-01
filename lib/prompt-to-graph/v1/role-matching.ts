/**
 * Scored role matching for multi-agent systems.
 * Replaces fragile .includes() substring matching with Levenshtein + word boundary scoring.
 */

/** Normalize a role string: uppercase, strip common suffixes, split camelCase */
function normalizeRole(role: string): string {
  return role
    .replace(/[_\s-]+/g, '')
    .replace(/agent$/i, '')
    .toUpperCase();
}

/** Extract word tokens from a role name (split on camelCase boundaries, underscores, spaces) */
function tokenizeRole(role: string): string[] {
  return role
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\s-]+/g, ' ')
    .replace(/agent$/i, '')
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Standard Levenshtein edit distance */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/** Jaccard similarity between two sets of word tokens (0–1) */
function wordOverlap(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Score how well a node label matches a sub-agent role (0–1).
 *
 * Scoring weights:
 * - 0.5: Normalized exact match (after stripping "Agent" suffix, uppercasing)
 * - 0.3: Word token overlap (Jaccard similarity)
 * - 0.2: Levenshtein similarity (1 - distance/maxLen)
 */
export function scoreRoleMatch(nodeLabel: string, subAgentRole: string): number {
  const normA = normalizeRole(nodeLabel);
  const normB = normalizeRole(subAgentRole);

  // Exact normalized match
  const exactScore = normA === normB ? 1.0 : 0.0;

  // Word overlap
  const tokensA = tokenizeRole(nodeLabel);
  const tokensB = tokenizeRole(subAgentRole);
  const overlapScore = wordOverlap(tokensA, tokensB);

  // Levenshtein similarity
  const maxLen = Math.max(normA.length, normB.length);
  const levSimilarity = maxLen === 0 ? 1 : 1 - levenshteinDistance(normA, normB) / maxLen;

  return 0.5 * exactScore + 0.3 * overlapScore + 0.2 * levSimilarity;
}

/**
 * Find the best matching role from a list of candidates.
 * Returns the best match and its confidence score.
 */
export function findBestRoleMatch(
  nodeLabel: string,
  candidateRoles: string[]
): { bestMatch: string | null; confidence: number } {
  if (candidateRoles.length === 0) {
    return { bestMatch: null, confidence: 0 };
  }

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const role of candidateRoles) {
    const score = scoreRoleMatch(nodeLabel, role);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = role;
    }
  }

  return { bestMatch, confidence: bestScore };
}

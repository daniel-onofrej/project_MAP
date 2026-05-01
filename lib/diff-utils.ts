// ─────────────────────────────────────────────────────────────────────────────
// LCS-based line diff shared between the toolbar badge and the diff dialog
// ─────────────────────────────────────────────────────────────────────────────

export interface InlineSpan {
  text: string;
  type: 'same' | 'added' | 'removed';
}

export type DiffRow =
  | { type: 'same';     left: string; right: string }
  | { type: 'added';    left: null;   right: string }
  | { type: 'removed';  left: string; right: null   }
  | { type: 'modified'; left: string; right: string; leftSpans: InlineSpan[]; rightSpans: InlineSpan[] };

export interface DiffStats {
  added: number;
  removed: number;
  same: number;
  modified: number;
}

export function diffLines(original: string, reconstructed: string): DiffRow[] {
  const a = original.split('\n');
  const b = reconstructed.split('\n');
  const m = a.length;
  const n = b.length;

  // Cap at 800 lines each to keep O(m*n) LCS feasible
  const aSlice = a.slice(0, 800);
  const bSlice = b.slice(0, 800);
  const M = aSlice.length;
  const N = bSlice.length;

  const dp = new Uint32Array((M + 1) * (N + 1));
  const idx = (i: number, j: number) => i * (N + 1) + j;

  for (let i = 1; i <= M; i++) {
    for (let j = 1; j <= N; j++) {
      dp[idx(i, j)] =
        aSlice[i - 1] === bSlice[j - 1]
          ? dp[idx(i - 1, j - 1)] + 1
          : Math.max(dp[idx(i - 1, j)], dp[idx(i, j - 1)]);
    }
  }

  const matches: [number, number][] = [];
  let i = M, j = N;
  while (i > 0 && j > 0) {
    if (aSlice[i - 1] === bSlice[j - 1]) {
      matches.unshift([i - 1, j - 1]);
      i--; j--;
    } else if (dp[idx(i - 1, j)] >= dp[idx(i, j - 1)]) {
      i--;
    } else {
      j--;
    }
  }

  const rawRows: DiffRow[] = [];
  let li = 0, ri = 0;
  for (const [mi, mj] of matches) {
    while (li < mi) rawRows.push({ type: 'removed', left: a[li++], right: null });
    while (ri < mj) rawRows.push({ type: 'added',   left: null,    right: b[ri++] });
    rawRows.push({ type: 'same', left: a[li++], right: b[ri++] });
  }
  while (li < m) rawRows.push({ type: 'removed', left: a[li++], right: null });
  while (ri < n) rawRows.push({ type: 'added',   left: null,    right: b[ri++] });

  // Post-process: pair consecutive removed+added lines that are similar
  // into 'modified' rows with inline word-level highlights
  return pairModifiedRows(rawRows);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pair consecutive removed+added rows into 'modified' rows when the lines
// are similar enough (> 40% word overlap). This lets the UI show inline
// highlights instead of full-line red/green.
// ─────────────────────────────────────────────────────────────────────────────
function pairModifiedRows(rows: DiffRow[]): DiffRow[] {
  const result: DiffRow[] = [];
  let i = 0;

  while (i < rows.length) {
    // Look for a run of removed rows followed by a run of added rows
    if (rows[i].type === 'removed') {
      const removedStart = i;
      while (i < rows.length && rows[i].type === 'removed') i++;
      const addedStart = i;
      while (i < rows.length && rows[i].type === 'added') i++;

      const removedRows = rows.slice(removedStart, addedStart) as Array<{ type: 'removed'; left: string; right: null }>;
      const addedRows = rows.slice(addedStart, i) as Array<{ type: 'added'; left: null; right: string }>;

      // Pair them up: match each removed with the most similar added
      const pairedRemoved = new Set<number>();
      const pairedAdded = new Set<number>();

      // For each removed line, find the best matching added line
      for (let ri = 0; ri < removedRows.length; ri++) {
        let bestIdx = -1;
        let bestSim = 0.4; // minimum threshold
        for (let ai = 0; ai < addedRows.length; ai++) {
          if (pairedAdded.has(ai)) continue;
          const sim = lineSimilarity(removedRows[ri].left, addedRows[ai].right!);
          if (sim > bestSim) {
            bestSim = sim;
            bestIdx = ai;
          }
        }
        if (bestIdx >= 0) {
          pairedRemoved.add(ri);
          pairedAdded.add(bestIdx);

          const { leftSpans, rightSpans } = diffWords(removedRows[ri].left, addedRows[bestIdx].right!);
          result.push({
            type: 'modified',
            left: removedRows[ri].left,
            right: addedRows[bestIdx].right!,
            leftSpans,
            rightSpans,
          });
        }
      }

      // Emit unpaired removed/added in their original order
      for (let ri = 0; ri < removedRows.length; ri++) {
        if (!pairedRemoved.has(ri)) result.push(removedRows[ri]);
      }
      for (let ai = 0; ai < addedRows.length; ai++) {
        if (!pairedAdded.has(ai)) result.push(addedRows[ai]);
      }
    } else {
      result.push(rows[i]);
      i++;
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Word-level diff: split two lines into words, run LCS, return highlighted spans
// ─────────────────────────────────────────────────────────────────────────────

// Tokenize preserving whitespace as separate tokens so we can reconstruct
function tokenize(s: string): string[] {
  const tokens: string[] = [];
  const re = /(\s+|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

function diffWords(a: string, b: string): { leftSpans: InlineSpan[]; rightSpans: InlineSpan[] } {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  const M = tokA.length;
  const N = tokB.length;

  // LCS on tokens (capped at 500 tokens per side)
  const mCap = Math.min(M, 500);
  const nCap = Math.min(N, 500);

  const dp = new Uint16Array((mCap + 1) * (nCap + 1));
  const idx = (i: number, j: number) => i * (nCap + 1) + j;

  for (let i = 1; i <= mCap; i++) {
    for (let j = 1; j <= nCap; j++) {
      dp[idx(i, j)] =
        tokA[i - 1] === tokB[j - 1]
          ? dp[idx(i - 1, j - 1)] + 1
          : Math.max(dp[idx(i - 1, j)], dp[idx(i, j - 1)]);
    }
  }

  // Backtrack to find matching tokens
  const matches: [number, number][] = [];
  let ci = mCap, cj = nCap;
  while (ci > 0 && cj > 0) {
    if (tokA[ci - 1] === tokB[cj - 1]) {
      matches.unshift([ci - 1, cj - 1]);
      ci--; cj--;
    } else if (dp[idx(ci - 1, cj)] >= dp[idx(ci, cj - 1)]) {
      ci--;
    } else {
      cj--;
    }
  }

  // Build left spans (removed = highlighted, same = normal)
  const leftSpans: InlineSpan[] = [];
  let li = 0;
  for (const [mi] of matches) {
    if (li < mi) {
      leftSpans.push({ text: tokA.slice(li, mi).join(''), type: 'removed' });
    }
    leftSpans.push({ text: tokA[mi], type: 'same' });
    li = mi + 1;
  }
  if (li < M) {
    leftSpans.push({ text: tokA.slice(li).join(''), type: 'removed' });
  }

  // Build right spans (added = highlighted, same = normal)
  const rightSpans: InlineSpan[] = [];
  let ri = 0;
  for (const [, mj] of matches) {
    if (ri < mj) {
      rightSpans.push({ text: tokB.slice(ri, mj).join(''), type: 'added' });
    }
    rightSpans.push({ text: tokB[mj], type: 'same' });
    ri = mj + 1;
  }
  if (ri < N) {
    rightSpans.push({ text: tokB.slice(ri).join(''), type: 'added' });
  }

  return { leftSpans, rightSpans };
}

// Quick word-overlap similarity (0–1) for pairing lines
function lineSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export function computeDiffStats(rows: DiffRow[]): DiffStats {
  const modified = rows.filter(r => r.type === 'modified').length;
  return {
    added:    rows.filter(r => r.type === 'added').length + modified,
    removed:  rows.filter(r => r.type === 'removed').length + modified,
    same:     rows.filter(r => r.type === 'same').length,
    modified,
  };
}

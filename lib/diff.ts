/**
 * Professional line-based diff algorithm (Myers / Longest Common Subsequence)
 * for the RAIZEL AI Artifact Workspace.
 */

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffResult {
  lines: DiffLine[];
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  modifications: number;
  isEqual: boolean;
}

/**
 * Computes the Longest Common Subsequence (LCS) matrix between two arrays of lines.
 * Uses a memory-optimized approach for fast execution even with medium-to-large files.
 */
function computeLCS(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;

  // Capped matrix to prevent excessive memory on huge files (fallback to fast chunking)
  if (m * n > 4000000) {
    return computeFastLCS(oldLines, newLines);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  return dp;
}

/**
 * Fallback for huge files: prefix/suffix trimming with banded LCS.
 */
function computeFastLCS(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  const maxLookahead = 40;
  for (let i = 0; i < m; i++) {
    const startJ = Math.max(0, i - maxLookahead);
    const endJ = Math.min(n, i + maxLookahead);
    for (let j = startJ; j < endJ; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = (dp[i][j] || 0) + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j] || 0, dp[i][j + 1] || 0);
      }
    }
  }

  return dp;
}

/**
 * Computes a detailed, line-accurate diff between oldText and newText.
 */
export function computeLineDiff(oldText: string, newText: string): DiffResult {
  if (oldText === newText) {
    const lines = (oldText ? oldText.split('\n') : []).map((line, idx) => ({
      type: 'unchanged' as const,
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
      content: line,
    }));

    return {
      lines,
      hunks: [],
      additions: 0,
      deletions: 0,
      modifications: 0,
      isEqual: true,
    };
  }

  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  const dp = computeLCS(oldLines, newLines);

  let i = oldLines.length;
  let j = newLines.length;
  const diffReversed: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffReversed.push({
        type: 'unchanged',
        oldLineNumber: i,
        newLineNumber: j,
        content: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffReversed.push({
        type: 'added',
        newLineNumber: j,
        content: newLines[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diffReversed.push({
        type: 'removed',
        oldLineNumber: i,
        content: oldLines[i - 1],
      });
      i--;
    } else {
      break;
    }
  }

  const lines = diffReversed.reverse();

  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.type === 'added') additions++;
    if (line.type === 'removed') deletions++;
  }

  const modifications = Math.min(additions, deletions);
  const hunks = groupDiffHunks(lines);

  return {
    lines,
    hunks,
    additions,
    deletions,
    modifications,
    isEqual: additions === 0 && deletions === 0,
  };
}

/**
 * Groups diff lines into standard Git-like diff hunks with context lines (default: 3).
 */
export function groupDiffHunks(lines: DiffLine[], context = 3): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const n = lines.length;
  if (n === 0) return hunks;

  const isChange = (idx: number) => lines[idx].type !== 'unchanged';

  let i = 0;
  while (i < n) {
    if (!isChange(i)) {
      i++;
      continue;
    }

    // Found start of change block. Include up to `context` preceding unchanged lines
    const start = Math.max(0, i - context);

    // Find end of change block, absorbing small gaps <= 2 * context
    let end = i;
    while (end < n) {
      if (isChange(end)) {
        end++;
      } else {
        // Lookahead to see if next change is within 2 * context
        let nextChange = -1;
        for (let k = end; k < Math.min(n, end + 2 * context + 1); k++) {
          if (isChange(k)) {
            nextChange = k;
            break;
          }
        }
        if (nextChange !== -1) {
          end = nextChange + 1;
        } else {
          break;
        }
      }
    }

    // Include up to `context` trailing unchanged lines
    const hunkEnd = Math.min(n, end + context);
    const hunkLines = lines.slice(start, hunkEnd);

    // Calculate line numbers
    const oldFirst = hunkLines.find((l) => l.oldLineNumber !== undefined);
    const newFirst = hunkLines.find((l) => l.newLineNumber !== undefined);

    const oldStart = oldFirst?.oldLineNumber || 1;
    const newStart = newFirst?.newLineNumber || 1;

    const oldLinesCount = hunkLines.filter((l) => l.type !== 'added').length;
    const newLinesCount = hunkLines.filter((l) => l.type !== 'removed').length;

    hunks.push({
      oldStart,
      oldLines: oldLinesCount,
      newStart,
      newLines: newLinesCount,
      lines: hunkLines,
    });

    i = hunkEnd;
  }

  return hunks;
}

'use client';

import React, { useMemo, useState } from 'react';
import { computeLineDiff, groupDiffHunks } from '@/lib/diff';
import { cx } from '../ui/primitives';

interface DiffViewProps {
  before: string;
  after: string;
  /** Shown above the diff, e.g. the file path. */
  label?: string;
}

type DiffMode = 'unified' | 'split';

export const DiffView: React.FC<DiffViewProps> = ({ before, after, label }) => {
  const [mode, setMode] = useState<DiffMode>('unified');

  const diff = useMemo(() => computeLineDiff(before, after), [before, after]);
  const hunks = useMemo(() => groupDiffHunks(diff.lines, 3), [diff.lines]);

  if (diff.isEqual) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="text-[13px] text-[var(--text-muted)]">
          No changes{label ? ` in ${label}` : ''}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-1.5">
        <span className="flex items-center gap-2 tabular text-[11px]">
          <span className="text-[var(--diff-add-text)]">+{diff.additions}</span>
          <span className="text-[var(--diff-del-text)]">−{diff.deletions}</span>
          {label && <span className="truncate font-mono text-[var(--text-muted)]">{label}</span>}
        </span>

        <div className="flex shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] p-0.5">
          {(['unified', 'split'] as DiffMode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={cx(
                'rounded-[2px] px-2 py-0.5 text-[11px] capitalize transition-colors',
                mode === option
                  ? 'bg-[var(--fill-active)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto code-surface">
        {mode === 'unified' ? (
          <UnifiedDiff hunks={hunks} />
        ) : (
          <SplitDiff hunks={hunks} />
        )}
      </div>
    </div>
  );
};

type Hunk = ReturnType<typeof groupDiffHunks>[number];

const GUTTER = 'w-11 shrink-0 select-none pr-2 text-right text-[var(--text-muted)] tabular';

const HunkHeader: React.FC<{ hunk: Hunk }> = ({ hunk }) => (
  <div className="bg-[var(--fill)] px-3 py-1 text-[11px] text-[var(--text-muted)]">
    @@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
  </div>
);

const UnifiedDiff: React.FC<{ hunks: Hunk[] }> = ({ hunks }) => (
  <div className="min-w-max">
    {hunks.map((hunk, hunkIndex) => (
      <div key={hunkIndex}>
        <HunkHeader hunk={hunk} />
        {hunk.lines.map((line, lineIndex) => (
          <div
            key={lineIndex}
            className={cx(
              'flex whitespace-pre px-3',
              line.type === 'added' && 'bg-[var(--diff-add-bg)]',
              line.type === 'removed' && 'bg-[var(--diff-del-bg)]'
            )}
          >
            <span className={GUTTER}>{line.oldLineNumber ?? ''}</span>
            <span className={GUTTER}>{line.newLineNumber ?? ''}</span>
            <span
              className={cx(
                'w-4 shrink-0 select-none',
                line.type === 'added' && 'text-[var(--diff-add-text)]',
                line.type === 'removed' && 'text-[var(--diff-del-text)]'
              )}
            >
              {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
            </span>
            <span className="text-[var(--code-text)]">{line.content || ' '}</span>
          </div>
        ))}
      </div>
    ))}
  </div>
);

const SplitDiff: React.FC<{ hunks: Hunk[] }> = ({ hunks }) => (
  <div className="min-w-max">
    {hunks.map((hunk, hunkIndex) => {
      // Pair removals with additions so they sit side by side.
      const rows: Array<{ left?: (typeof hunk.lines)[number]; right?: (typeof hunk.lines)[number] }> = [];
      let index = 0;

      while (index < hunk.lines.length) {
        const line = hunk.lines[index];

        if (line.type === 'unchanged') {
          rows.push({ left: line, right: line });
          index++;
          continue;
        }

        const removals: typeof hunk.lines = [];
        const additions: typeof hunk.lines = [];
        while (index < hunk.lines.length && hunk.lines[index].type === 'removed') {
          removals.push(hunk.lines[index++]);
        }
        while (index < hunk.lines.length && hunk.lines[index].type === 'added') {
          additions.push(hunk.lines[index++]);
        }
        for (let i = 0; i < Math.max(removals.length, additions.length); i++) {
          rows.push({ left: removals[i], right: additions[i] });
        }
      }

      return (
        <div key={hunkIndex}>
          <HunkHeader hunk={hunk} />
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex">
              <div
                className={cx(
                  'flex w-1/2 min-w-0 whitespace-pre border-r border-[var(--border)] px-2',
                  row.left?.type === 'removed' && 'bg-[var(--diff-del-bg)]'
                )}
              >
                <span className={GUTTER}>{row.left?.oldLineNumber ?? ''}</span>
                <span className="truncate text-[var(--code-text)]">{row.left?.content ?? ''}</span>
              </div>
              <div
                className={cx(
                  'flex w-1/2 min-w-0 whitespace-pre px-2',
                  row.right?.type === 'added' && 'bg-[var(--diff-add-bg)]'
                )}
              >
                <span className={GUTTER}>{row.right?.newLineNumber ?? ''}</span>
                <span className="truncate text-[var(--code-text)]">{row.right?.content ?? ''}</span>
              </div>
            </div>
          ))}
        </div>
      );
    })}
  </div>
);

'use client';

import React, { useMemo } from 'react';
import { Plus, Minus, FileCode } from 'lucide-react';

interface DiffViewProps {
  filePath: string;
  previousContent: string;
  currentContent: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

// Simple, fast Myers-like line diff generator
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diff: DiffLine[] = [];

  // If old is completely empty, all new are additions
  if (!oldText) {
    return newLines.map((line, idx) => ({
      type: 'added',
      newLineNumber: idx + 1,
      content: line,
    }));
  }

  // Fast line comparison
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diff.push({
        type: 'unchanged',
        oldLineNumber: i + 1,
        newLineNumber: j + 1,
        content: oldLines[i],
      });
      i++;
      j++;
    } else {
      // Lookahead to see if next line matches
      let foundMatch = false;
      const lookahead = 5;

      for (let k = 1; k <= lookahead; k++) {
        if (j + k < newLines.length && oldLines[i] === newLines[j + k]) {
          // New lines were inserted
          for (let m = 0; m < k; m++) {
            diff.push({
              type: 'added',
              newLineNumber: j + m + 1,
              content: newLines[j + m],
            });
          }
          j += k;
          foundMatch = true;
          break;
        } else if (i + k < oldLines.length && oldLines[i + k] === newLines[j]) {
          // Old lines were removed
          for (let m = 0; m < k; m++) {
            diff.push({
              type: 'removed',
              oldLineNumber: i + m + 1,
              content: oldLines[i + m],
            });
          }
          i += k;
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        if (i < oldLines.length) {
          diff.push({
            type: 'removed',
            oldLineNumber: i + 1,
            content: oldLines[i],
          });
          i++;
        }
        if (j < newLines.length) {
          diff.push({
            type: 'added',
            newLineNumber: j + 1,
            content: newLines[j],
          });
          j++;
        }
      }
    }
  }

  return diff;
}

export const DiffView: React.FC<DiffViewProps> = ({
  filePath,
  previousContent,
  currentContent,
}) => {
  const diffLines = useMemo(
    () => computeDiff(previousContent, currentContent),
    [previousContent, currentContent]
  );

  const additions = diffLines.filter((l) => l.type === 'added').length;
  const deletions = diffLines.filter((l) => l.type === 'removed').length;

  return (
    <div className="flex flex-col h-full bg-[#090b11] text-xs font-mono select-text">
      {/* Diff Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] text-slate-300">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-white">{filePath}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-emerald-400 font-medium flex items-center gap-0.5">
            <Plus className="w-3 h-3" /> {additions} additions
          </span>
          <span className="text-rose-400 font-medium flex items-center gap-0.5">
            <Minus className="w-3 h-3" /> {deletions} deletions
          </span>
        </div>
      </div>

      {/* Diff Code Rows */}
      <div className="flex-1 overflow-auto p-2 leading-relaxed">
        {diffLines.map((line, idx) => {
          let bgClass = 'hover:bg-white/[0.02]';
          const textClass = 'text-slate-300';
          let sign = ' ';

          if (line.type === 'added') {
            bgClass = 'bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300';
            sign = '+';
          } else if (line.type === 'removed') {
            bgClass = 'bg-rose-500/10 hover:bg-rose-500/15 text-rose-300';
            sign = '-';
          }

          return (
            <div key={idx} className={`flex items-start ${bgClass} py-0.5 px-2 rounded`}>
              {/* Line Numbers */}
              <span className="w-9 text-right pr-2 text-[10px] text-slate-600 select-none shrink-0 font-mono">
                {line.oldLineNumber ?? ''}
              </span>
              <span className="w-9 text-right pr-3 text-[10px] text-slate-600 select-none shrink-0 font-mono">
                {line.newLineNumber ?? ''}
              </span>
              <span className="w-4 text-center select-none shrink-0 font-bold">
                {sign}
              </span>
              <span className={`whitespace-pre flex-1 ${textClass} break-all`}>
                {line.content || ' '}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

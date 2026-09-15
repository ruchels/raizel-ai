'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Minus, FileCode, Layers, AlignLeft, Check, Copy } from 'lucide-react';
import { computeLineDiff } from '@/lib/diff';

interface DiffViewProps {
  filePath: string;
  previousContent: string;
  currentContent: string;
}

export const DiffView: React.FC<DiffViewProps> = ({
  filePath,
  previousContent,
  currentContent,
}) => {
  const [viewMode, setViewMode] = useState<'hunks' | 'all'>('hunks');
  const [copiedDiff, setCopiedDiff] = useState(false);

  const diffResult = useMemo(
    () => computeLineDiff(previousContent, currentContent),
    [previousContent, currentContent]
  );

  const handleCopyDiff = async () => {
    const rawDiff = diffResult.lines
      .map((l) => {
        const sign = l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' ';
        return `${sign} ${l.content}`;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(rawDiff);
      setCopiedDiff(true);
      setTimeout(() => setCopiedDiff(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#090b11] text-xs font-mono select-text overflow-hidden">
      {/* Diff Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-[#090b11] border-b border-white/[0.08] text-slate-300">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="font-semibold text-white truncate text-[12px]">{filePath}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Additions / Deletions count */}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium flex items-center gap-1">
              <Plus className="w-3 h-3" /> +{diffResult.additions}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium flex items-center gap-1">
              <Minus className="w-3 h-3" /> -{diffResult.deletions}
            </span>
          </div>

          {/* Toggle View Mode: Hunks only vs Full File */}
          <div className="flex items-center rounded-lg bg-white/[0.05] border border-white/[0.08] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode('hunks')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                viewMode === 'hunks'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Show only modified chunks with context"
            >
              <Layers className="w-3 h-3" />
              <span>Hunks</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                viewMode === 'all'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Show entire file with inline diff"
            >
              <AlignLeft className="w-3 h-3" />
              <span>Full</span>
            </button>
          </div>

          {/* Copy Diff */}
          <button
            type="button"
            onClick={handleCopyDiff}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Copy diff to clipboard"
          >
            {copiedDiff ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Diff Code Rows */}
      <div className="flex-1 overflow-auto p-2 leading-[1.625rem] custom-scrollbar bg-[#08090d]">
        {diffResult.isEqual ? (
          <div className="p-8 text-center text-slate-500">
            No changes detected between previous and current file version.
          </div>
        ) : viewMode === 'hunks' && diffResult.hunks.length > 0 ? (
          /* Render Hunks */
          <div className="space-y-4">
            {diffResult.hunks.map((hunk, hIdx) => (
              <div
                key={hIdx}
                className="rounded-xl overflow-hidden border border-white/[0.06] bg-[#090b11]"
              >
                {/* Hunk Header */}
                <div className="px-3 py-1 bg-indigo-950/30 border-b border-indigo-500/20 text-indigo-300/80 text-[10px] font-mono">
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </div>

                {/* Hunk Lines */}
                <div className="p-1">
                  {hunk.lines.map((line, idx) => {
                    let bgClass = 'hover:bg-white/[0.02]';
                    let textClass = 'text-slate-300';
                    let sign = ' ';

                    if (line.type === 'added') {
                      bgClass = 'bg-emerald-500/15 hover:bg-emerald-500/20 text-emerald-300';
                      textClass = 'text-emerald-200 font-medium';
                      sign = '+';
                    } else if (line.type === 'removed') {
                      bgClass = 'bg-rose-500/15 hover:bg-rose-500/20 text-rose-300';
                      textClass = 'text-rose-200';
                      sign = '-';
                    }

                    return (
                      <div key={idx} className={`flex items-start ${bgClass} py-0.5 px-2 rounded`}>
                        <span className="w-10 text-right pr-2 text-[10px] text-slate-600 select-none shrink-0 font-mono">
                          {line.oldLineNumber ?? ''}
                        </span>
                        <span className="w-10 text-right pr-3 text-[10px] text-slate-600 select-none shrink-0 font-mono">
                          {line.newLineNumber ?? ''}
                        </span>
                        <span className="w-4 text-center select-none shrink-0 font-bold">
                          {sign}
                        </span>
                        <span className={`whitespace-pre flex-1 ${textClass} break-all font-mono text-xs`}>
                          {line.content || ' '}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Render Full File Diff */
          <div>
            {diffResult.lines.map((line, idx) => {
              let bgClass = 'hover:bg-white/[0.02]';
              let textClass = 'text-slate-300';
              let sign = ' ';

              if (line.type === 'added') {
                bgClass = 'bg-emerald-500/15 hover:bg-emerald-500/20 text-emerald-300';
                textClass = 'text-emerald-200 font-medium';
                sign = '+';
              } else if (line.type === 'removed') {
                bgClass = 'bg-rose-500/15 hover:bg-rose-500/20 text-rose-300';
                textClass = 'text-rose-200';
                sign = '-';
              }

              return (
                <div key={idx} className={`flex items-start ${bgClass} py-0.5 px-2 rounded`}>
                  <span className="w-10 text-right pr-2 text-[10px] text-slate-600 select-none shrink-0 font-mono">
                    {line.oldLineNumber ?? ''}
                  </span>
                  <span className="w-10 text-right pr-3 text-[10px] text-slate-600 select-none shrink-0 font-mono">
                    {line.newLineNumber ?? ''}
                  </span>
                  <span className="w-4 text-center select-none shrink-0 font-bold">
                    {sign}
                  </span>
                  <span className={`whitespace-pre flex-1 ${textClass} break-all font-mono text-xs`}>
                    {line.content || ' '}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="shrink-0 h-6 px-4 bg-[#06070a] border-t border-white/[0.06] flex items-center justify-between text-[10px] text-slate-500 select-none">
        <div>Line-based Myers Diff</div>
        <div>
          {diffResult.hunks.length} {diffResult.hunks.length === 1 ? 'hunk' : 'hunks'} &bull;{' '}
          {diffResult.additions} added, {diffResult.deletions} removed
        </div>
      </div>
    </div>
  );
};

'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  Download,
  Edit3,
  GitCompare,
  Save,
  RotateCcw,
  FileCode,
} from 'lucide-react';
import { ArtifactFile } from '@/types/artifact';
import { downloadSingleFile } from '@/lib/zip';
import { DiffView } from './DiffView';

interface CodeEditorProps {
  file: ArtifactFile | null;
  onSaveFileContent?: (path: string, newContent: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  file,
  onSaveFileContent,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [editableContent, setEditableContent] = useState('');
  const [isModifiedLocally, setIsModifiedLocally] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Sync state when active file changes
  useEffect(() => {
    if (file) {
      setEditableContent(file.content || '');
      setIsEditing(false);
      setShowDiff(false);
      setIsModifiedLocally(false);
    }
  }, [file]);

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 bg-[#090b11]">
        <FileCode className="w-12 h-12 text-slate-600/50 mb-3" />
        <p className="text-sm font-medium text-slate-400">No file selected</p>
        <p className="text-xs text-slate-500 mt-1">Select a file from the explorer to view its content.</p>
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editableContent : file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    downloadSingleFile({
      ...file,
      content: isEditing ? editableContent : file.content,
    });
  };

  const handleSave = () => {
    if (onSaveFileContent) {
      onSaveFileContent(file.path, editableContent);
    }
    setIsModifiedLocally(false);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditableContent(file.content || '');
    setIsModifiedLocally(false);
    setIsEditing(false);
  };

  // Support Tab key indentation inside editor textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const updated = editableContent.substring(0, start) + '  ' + editableContent.substring(end);
      setEditableContent(updated);
      setIsModifiedLocally(true);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const lines = (isEditing ? editableContent : file.content || '').split('\n');
  const lineCount = lines.length;
  const hasDiff = Boolean(file.previousContent && file.previousContent !== file.content);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-[#090b11] overflow-hidden">
      {/* Top Toolbar */}
      <div className="shrink-0 h-10 px-4 bg-[#090b11] border-b border-white/[0.08] flex items-center justify-between gap-3 text-xs select-none">
        {/* File Path & Language */}
        <div className="min-w-0 flex items-center gap-2">
          <span className="font-mono text-slate-300 font-semibold truncate text-[12px]">
            {file.path}
          </span>
          <span className="px-2 py-0.5 rounded bg-white/[0.06] text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            {file.language || 'code'}
          </span>
          {isModifiedLocally && (
            <span className="text-[10px] text-amber-400 font-medium bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
              Unsaved
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Diff View Toggle */}
          {hasDiff && (
            <button
              type="button"
              onClick={() => setShowDiff(!showDiff)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                showDiff
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-950/40'
                  : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
              }`}
              title="View AI modifications diff"
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>{showDiff ? 'Exit Diff' : 'View Changes'}</span>
            </button>
          )}

          {/* Edit / View Mode Toggle */}
          {!showDiff && (
            <>
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
                    title="Save changes"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="p-1 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    title="Cancel editing"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Edit file"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )}
            </>
          )}

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Copy file code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>

          {/* Download Single File */}
          <button
            type="button"
            onClick={handleDownload}
            className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Download this file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area: Diff vs Editor / Viewer */}
      {showDiff && file.previousContent ? (
        <DiffView
          filePath={file.path}
          previousContent={file.previousContent}
          currentContent={file.content}
        />
      ) : isEditing ? (
        /* Edit Mode Textarea with Line Numbers */
        <div className="flex-1 flex overflow-hidden font-mono text-xs leading-relaxed bg-[#08090d]">
          {/* Line Numbers */}
          <div
            ref={lineNumbersRef}
            className="w-12 py-3 pr-2 text-right text-slate-600 bg-[#06070a] border-r border-white/[0.06] select-none shrink-0 overflow-hidden font-mono text-[11px]"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1} className="leading-[1.625rem]">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Editable Text Area */}
          <textarea
            ref={textareaRef}
            value={editableContent}
            onChange={(e) => {
              setEditableContent(e.target.value);
              setIsModifiedLocally(true);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="flex-1 p-3 bg-transparent text-slate-200 resize-none focus:outline-none overflow-auto font-mono text-xs leading-[1.625rem] whitespace-pre"
          />
        </div>
      ) : (
        /* View Mode with Line Numbers and Monospace Layout */
        <div className="flex-1 flex overflow-auto font-mono text-xs leading-[1.625rem] bg-[#08090d]">
          {/* Line Numbers */}
          <div className="w-12 py-3 pr-2 text-right text-slate-600 bg-[#06070a] border-r border-white/[0.06] select-none shrink-0 font-mono text-[11px]">
            {lines.map((_, i) => (
              <div key={i + 1} className="leading-[1.625rem]">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code Text Content */}
          <div className="flex-1 p-3 overflow-x-auto min-w-0">
            <pre className="!bg-transparent !p-0 !m-0 font-mono text-slate-200 text-xs leading-[1.625rem] whitespace-pre">
              <code>{file.content}</code>
            </pre>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="shrink-0 h-6 px-4 bg-[#06070a] border-t border-white/[0.06] flex items-center justify-between text-[10px] text-slate-500 select-none">
        <div className="flex items-center gap-3">
          <span>{lineCount} lines</span>
          <span>{new Blob([file.content || '']).size} bytes</span>
          <span>UTF-8</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Raizel Workspace Editor</span>
        </div>
      </div>
    </div>
  );
};

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Copy,
  Check,
  Download,
  Edit3,
  GitCompare,
  Save,
  RotateCcw,
  FileCode,
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Undo2,
  Redo2,
  WrapText,
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
  const [wrapLines, setWrapLines] = useState(false);

  // In-file search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Undo / Redo history stack
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const viewCodeRef = useRef<HTMLDivElement>(null);

  // Sync state when active file changes
  useEffect(() => {
    if (file) {
      const initial = file.content || '';
      setEditableContent(initial);
      setIsEditing(false);
      setShowDiff(false);
      setIsModifiedLocally(false);
      setIsSearchOpen(false);
      setSearchQuery('');
      setHistory([initial]);
      setHistoryIndex(0);
    }
  }, [file]);

  // Synchronize scroll between line numbers gutter and code area
  const handleScroll = (e: React.UIEvent<HTMLDivElement | HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Perform search match calculation
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setCurrentMatchIndex(0);
      return;
    }

    const textToSearch = isEditing ? editableContent : file?.content || '';
    const queryLower = searchQuery.toLowerCase();
    const textLower = textToSearch.toLowerCase();
    const matches: number[] = [];

    let pos = 0;
    while ((pos = textLower.indexOf(queryLower, pos)) !== -1) {
      matches.push(pos);
      pos += queryLower.length;
    }

    setSearchResults(matches);
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
  }, [searchQuery, editableContent, file?.content, isEditing]);

  const handleNextMatch = () => {
    if (searchResults.length === 0) return;
    const next = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(next);
    scrollToMatch(searchResults[next]);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return;
    const prev = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prev);
    scrollToMatch(searchResults[prev]);
  };

  const scrollToMatch = (pos: number) => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos + searchQuery.length);
    }
  };

  const updateContentWithHistory = (newContent: string) => {
    setEditableContent(newContent);
    setIsModifiedLocally(true);

    // Push into history stack (capped at 50 states)
    const nextHistory = history.slice(0, historyIndex + 1);
    if (nextHistory[nextHistory.length - 1] !== newContent) {
      nextHistory.push(newContent);
      if (nextHistory.length > 50) nextHistory.shift();
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevContent = history[prevIndex];
      setHistoryIndex(prevIndex);
      setEditableContent(prevContent);
      setIsModifiedLocally(prevContent !== (file?.content || ''));
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextContent = history[nextIndex];
      setHistoryIndex(nextIndex);
      setEditableContent(nextContent);
      setIsModifiedLocally(nextContent !== (file?.content || ''));
    }
  };

  const handleSave = useCallback(() => {
    if (!file) return;
    if (onSaveFileContent) {
      onSaveFileContent(file.path, editableContent);
    }
    setIsModifiedLocally(false);
    setIsEditing(false);
  }, [file, onSaveFileContent, editableContent]);

  const handleCancelEdit = () => {
    if (isModifiedLocally) {
      if (!window.confirm('Discard unsaved changes to this file?')) {
        return;
      }
    }
    setEditableContent(file?.content || '');
    setIsModifiedLocally(false);
    setIsEditing(false);
  };

  // Keyboard Shortcuts (Ctrl+S, Ctrl+F, Tab, Shift+Tab, Ctrl+Z, Ctrl+Y, Esc)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+S / Cmd+S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
      return;
    }

    // Ctrl+F / Cmd+F: Search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setIsSearchOpen(true);
      return;
    }

    // Ctrl+Z: Undo
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      handleUndo();
      return;
    }

    // Ctrl+Y or Ctrl+Shift+Z: Redo
    if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
      e.preventDefault();
      handleRedo();
      return;
    }

    // Escape: Cancel edit mode or close search
    if (e.key === 'Escape') {
      if (isSearchOpen) {
        setIsSearchOpen(false);
      } else if (isEditing) {
        handleCancelEdit();
      }
      return;
    }

    // Tab / Shift+Tab indentation (2 spaces)
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;

      if (!e.shiftKey) {
        // Indent
        const updated = editableContent.substring(0, start) + '  ' + editableContent.substring(end);
        updateContentWithHistory(updated);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
          }
        }, 0);
      } else {
        // Shift+Tab unindent
        if (start >= 2 && editableContent.substring(start - 2, start) === '  ') {
          const updated = editableContent.substring(0, start - 2) + editableContent.substring(end);
          updateContentWithHistory(updated);
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start - 2;
            }
          }, 0);
        }
      }
    }
  };

  const handleCopy = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(isEditing ? editableContent : file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    if (!file) return;
    downloadSingleFile({
      ...file,
      content: isEditing ? editableContent : file.content,
    });
  };

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 bg-[#090b11]">
        <FileCode className="w-12 h-12 text-slate-600/50 mb-3" />
        <p className="text-sm font-medium text-slate-400">No file selected</p>
        <p className="text-xs text-slate-500 mt-1">Select a file from the explorer to view its content.</p>
      </div>
    );
  }

  const lines = (isEditing ? editableContent : file.content || '').split('\n');
  const lineCount = lines.length;
  const hasDiff = Boolean(file.previousContent && file.previousContent !== file.content);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-[#090b11] overflow-hidden relative">
      {/* In-file Search Bar Overlay (Ctrl+F) */}
      {isSearchOpen && (
        <div className="absolute top-11 right-4 z-30 flex items-center gap-1.5 p-1.5 rounded-xl bg-[#0e121d] border border-white/15 shadow-2xl shadow-black/90 text-xs text-slate-200 animate-in fade-in slide-in-from-top-2 duration-150">
          <Search className="w-3.5 h-3.5 text-slate-400 ml-1.5 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) handlePrevMatch();
                else handleNextMatch();
              } else if (e.key === 'Escape') {
                setIsSearchOpen(false);
              }
            }}
            placeholder="Find in file..."
            autoFocus
            className="w-36 sm:w-48 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none px-1"
          />

          <span className="text-[10px] text-slate-400 px-1 font-mono">
            {searchResults.length > 0
              ? `${currentMatchIndex + 1}/${searchResults.length}`
              : searchQuery
              ? '0/0'
              : ''}
          </span>

          <button
            type="button"
            onClick={handlePrevMatch}
            disabled={searchResults.length === 0}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
            title="Previous match (Shift+Enter)"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleNextMatch}
            disabled={searchResults.length === 0}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
            title="Next match (Enter)"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsSearchOpen(false)}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-rose-400 cursor-pointer ml-0.5"
            title="Close search (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="shrink-0 h-10 px-4 bg-[#090b11] border-b border-white/[0.08] flex items-center justify-between gap-3 text-xs select-none">
        {/* File Path & Status Badges */}
        <div className="min-w-0 flex items-center gap-2">
          <span className="font-mono text-slate-300 font-semibold truncate text-[12px]">
            {file.path}
          </span>
          <span className="px-2 py-0.5 rounded bg-white/[0.06] text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            {file.language || 'code'}
          </span>
          {isModifiedLocally && (
            <span className="text-[10px] text-amber-400 font-medium bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 animate-pulse">
              ● Unsaved
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Search Button */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isSearchOpen
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white'
            }`}
            title="Find in file (Ctrl+F)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Line Wrap Toggle */}
          <button
            type="button"
            onClick={() => setWrapLines(!wrapLines)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              wrapLines
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white'
            }`}
            title={wrapLines ? 'Disable line wrap' : 'Enable line wrap'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

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

          {/* Edit Mode Actions */}
          {!showDiff && (
            <>
              {isEditing ? (
                <div className="flex items-center gap-1">
                  {/* Undo / Redo */}
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Save Button */}
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-950/40 transition-colors cursor-pointer"
                    title="Save changes (Ctrl+S)"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>

                  {/* Cancel Button */}
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Cancel editing (Esc)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Edit file"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
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
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
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
          {/* Synchronized Line Numbers Gutter */}
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

          {/* Editable Text Area with Syntax Font and Indentation */}
          <textarea
            ref={textareaRef}
            value={editableContent}
            onChange={(e) => updateContentWithHistory(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            spellCheck={false}
            className={`flex-1 p-3 bg-transparent text-slate-200 resize-none focus:outline-none overflow-auto font-mono text-xs leading-[1.625rem] ${
              wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
          />
        </div>
      ) : (
        /* View Mode with Line Numbers and Monospace Layout */
        <div
          ref={viewCodeRef}
          onScroll={handleScroll}
          className="flex-1 flex overflow-auto font-mono text-xs leading-[1.625rem] bg-[#08090d]"
        >
          {/* Synchronized Line Numbers Gutter */}
          <div
            ref={lineNumbersRef}
            className="w-12 py-3 pr-2 text-right text-slate-600 bg-[#06070a] border-r border-white/[0.06] select-none shrink-0 font-mono text-[11px]"
          >
            {lines.map((_, i) => (
              <div key={i + 1} className="leading-[1.625rem]">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code Text Content */}
          <div className="flex-1 p-3 overflow-x-auto min-w-0">
            <pre
              className={`!bg-transparent !p-0 !m-0 font-mono text-slate-200 text-xs leading-[1.625rem] ${
                wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
              }`}
            >
              <code>{file.content}</code>
            </pre>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="shrink-0 h-6 px-4 bg-[#06070a] border-t border-white/[0.06] flex items-center justify-between text-[10px] text-slate-500 select-none">
        <div className="flex items-center gap-3">
          <span>{lineCount} lines</span>
          <span>{new Blob([file.content || '']).size} bytes</span>
          <span>UTF-8</span>
          {isEditing && (
            <span className="text-indigo-400 font-mono">
              Ctrl+S Save &bull; Tab Indent &bull; Ctrl+F Find &bull; Esc Cancel
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>Raizel Code Workspace V2</span>
        </div>
      </div>
    </div>
  );
};

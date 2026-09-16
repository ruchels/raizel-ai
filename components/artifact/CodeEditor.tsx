'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Pencil, GitCompare, Save, Undo2, WrapText, FileWarning } from 'lucide-react';
import type { ArtifactFile } from '@/types/artifact';
import { downloadSingleFile } from '@/lib/zip';
import { DiffView } from './DiffView';
import { Button, EmptyState, IconButton, cx } from '../ui/primitives';

interface CodeEditorProps {
  file: ArtifactFile | null;
  onSave: (path: string, content: string) => void;
}

type ViewMode = 'code' | 'diff';

/** Files longer than this are not syntax-highlighted, to keep typing responsive. */
const HIGHLIGHT_LINE_LIMIT = 4000;

export const CodeEditor: React.FC<CodeEditorProps> = ({ file, onSave }) => {
  const [mode, setMode] = useState<ViewMode>('code');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const path = file?.path;

  useEffect(() => {
    setDraft(file?.content ?? '');
    setIsEditing(false);
    setMode('code');
    setError(null);
  }, [path, file?.content]);

  const isDirty = isEditing && file !== null && draft !== file.content;
  const hasPrevious = Boolean(file?.previousContent !== undefined && file.previousContent !== file.content);

  const content = isEditing ? draft : (file?.content ?? '');
  const lineCount = useMemo(() => (content ? content.split('\n').length : 0), [content]);

  const save = useCallback(() => {
    if (!file || !isDirty) return;
    onSave(file.path, draft);
    setIsEditing(false);
  }, [file, isDirty, draft, onSave]);

  const copy = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Clipboard access was denied by the browser.');
    }
  };

  const download = () => {
    if (!file) return;
    try {
      downloadSingleFile(file);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file could not be downloaded.');
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      save();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.currentTarget;
      const { selectionStart, selectionEnd } = target;
      const next = `${draft.slice(0, selectionStart)}  ${draft.slice(selectionEnd)}`;
      setDraft(next);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = selectionStart + 2;
      });
    }
  };

  const syncScroll = (event: React.UIEvent<HTMLElement>) => {
    const { scrollTop, scrollLeft } = event.currentTarget;
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
    if (preRef.current && event.currentTarget !== preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
  };

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)]">
        <EmptyState title="No file selected" description="Pick a file from the tree to view it." />
      </div>
    );
  }

  if (file.isReadable === false) {
    return (
      <div className="flex h-full flex-col bg-[var(--bg)]">
        <Header
          file={file}
          lineCount={0}
          mode={mode}
          setMode={setMode}
          hasPrevious={false}
          isEditing={false}
          isDirty={false}
          wrap={wrap}
          setWrap={setWrap}
          copied={copied}
          onCopy={copy}
          onDownload={download}
          onEdit={() => {}}
          onCancel={() => {}}
          onSave={() => {}}
          editable={false}
        />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<FileWarning className="h-6 w-6 text-[var(--warning)]" />}
            title="This file was never read"
            description={
              file.unreadableReason ||
              'It is binary, too large, or could not be decoded as text. Its contents were not sent to the model.'
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg)]">
      <Header
        file={file}
        lineCount={lineCount}
        mode={mode}
        setMode={setMode}
        hasPrevious={hasPrevious}
        isEditing={isEditing}
        isDirty={isDirty}
        wrap={wrap}
        setWrap={setWrap}
        copied={copied}
        onCopy={copy}
        onDownload={download}
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setDraft(file.content);
          setIsEditing(false);
        }}
        onSave={save}
        editable
      />

      {error && (
        <p className="shrink-0 border-b border-[var(--border)] bg-[var(--danger-subtle)] px-3 py-1.5 text-[12px] text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'diff' ? (
          <DiffView before={file.previousContent ?? ''} after={file.content} label={file.path} />
        ) : (
          <div className="flex h-full min-h-0">
            <div
              ref={gutterRef}
              className="code-surface shrink-0 overflow-hidden border-r border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-3 text-right text-[var(--text-muted)] tabular"
              aria-hidden
            >
              {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={draft}
                spellCheck={false}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                onScroll={syncScroll}
                className={cx(
                  'code-surface min-h-0 flex-1 resize-none bg-transparent px-3 py-3 text-[var(--code-text)] outline-none',
                  wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
                )}
              />
            ) : (
              <pre
                ref={preRef}
                onScroll={syncScroll}
                className={cx(
                  'code-surface min-h-0 flex-1 overflow-auto px-3 py-3 text-[var(--code-text)]',
                  wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
                )}
              >
                <code className={lineCount <= HIGHLIGHT_LINE_LIMIT ? 'hljs' : undefined}>
                  {file.content}
                </code>
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

interface HeaderProps {
  file: ArtifactFile;
  lineCount: number;
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  hasPrevious: boolean;
  isEditing: boolean;
  isDirty: boolean;
  wrap: boolean;
  setWrap: (wrap: boolean) => void;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  editable: boolean;
}

const Header: React.FC<HeaderProps> = ({
  file,
  lineCount,
  mode,
  setMode,
  hasPrevious,
  isEditing,
  isDirty,
  wrap,
  setWrap,
  copied,
  onCopy,
  onDownload,
  onEdit,
  onCancel,
  onSave,
  editable,
}) => (
  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
    <div className="min-w-0">
      <p className="truncate font-mono text-[12px] text-[var(--text)]">{file.path}</p>
      <p className="tabular text-[11px] text-[var(--text-muted)]">
        {file.language}
        {lineCount > 0 && ` · ${lineCount} lines`}
        {file.isModified && ' · modified'}
      </p>
    </div>

    <div className="flex shrink-0 items-center gap-0.5">
      {isEditing ? (
        <>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <Undo2 className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={onSave} disabled={!isDirty}>
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        </>
      ) : (
        <>
          {hasPrevious && (
            <IconButton
              label={mode === 'diff' ? 'Show file' : 'Show changes'}
              size="sm"
              active={mode === 'diff'}
              onClick={() => setMode(mode === 'diff' ? 'code' : 'diff')}
            >
              <GitCompare className="h-3.5 w-3.5" />
            </IconButton>
          )}
          {mode === 'code' && (
            <IconButton
              label={wrap ? 'Disable word wrap' : 'Enable word wrap'}
              size="sm"
              active={wrap}
              onClick={() => setWrap(!wrap)}
            >
              <WrapText className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton label={copied ? 'Copied' : 'Copy file'} size="sm" onClick={onCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton label="Download file" size="sm" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
          </IconButton>
          {editable && mode === 'code' && (
            <IconButton label="Edit file" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </>
      )}
    </div>
  </div>
);

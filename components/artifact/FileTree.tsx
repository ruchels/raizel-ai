'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Search, FileWarning, X } from 'lucide-react';
import type { ArtifactFile, FileTreeNode } from '@/types/artifact';
import { buildFileTree } from '@/lib/artifact';
import { IconButton, cx } from '../ui/primitives';

interface FileTreeProps {
  files: ArtifactFile[];
  activeFilePath: string;
  onSelectFile: (path: string) => void;
}

interface FlatRow {
  node: FileTreeNode;
  depth: number;
}

/** Above this many rows we window the list instead of mounting every node. */
const VIRTUALIZE_THRESHOLD = 300;
const ROW_HEIGHT = 26;
const OVERSCAN = 12;

function flatten(nodes: FileTreeNode[], collapsed: Set<string>, depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.isDirectory && node.children && !collapsed.has(node.path)) {
      rows.push(...flatten(node.children, collapsed, depth + 1));
    }
  }
  return rows;
}

/** Directories containing the active file, so it is always revealed. */
function ancestorsOf(path: string): string[] {
  const segments = path.split('/');
  return segments.slice(0, -1).map((_, i) => segments.slice(0, i + 1).join('/'));
}

export const FileTree: React.FC<FileTreeProps> = ({ files, activeFilePath, onSelectFile }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  const scrollRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildFileTree(files), [files]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return files.filter((file) => file.path.toLowerCase().includes(needle)).slice(0, 400);
  }, [files, query]);

  const rows = useMemo(() => flatten(tree, collapsed), [tree, collapsed]);

  // Reveal the active file whenever it changes.
  useEffect(() => {
    if (!activeFilePath) return;
    setCollapsed((prev) => {
      const ancestors = ancestorsOf(activeFilePath);
      if (!ancestors.some((a) => prev.has(a))) return prev;
      const next = new Set(prev);
      for (const ancestor of ancestors) next.delete(ancestor);
      return next;
    });
  }, [activeFilePath]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    setViewportHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const shouldVirtualize = !matches && rows.length > VIRTUALIZE_THRESHOLD;
  const startIndex = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const endIndex = shouldVirtualize
    ? Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN)
    : rows.length;
  const visibleRows = shouldVirtualize ? rows.slice(startIndex, endIndex) : rows;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[var(--bg-subtle)]">
      <div className="shrink-0 border-b border-[var(--border)] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Filter ${files.length} files`}
            className="h-7 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--fill)] pl-7 pr-7 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:bg-[var(--bg)]"
          />
          {query && (
            <IconButton
              label="Clear filter"
              size="sm"
              className="absolute right-0 top-1/2 h-6 w-6 -translate-y-1/2"
              onClick={() => setQuery('')}
            >
              <X className="h-3 w-3" />
            </IconButton>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => shouldVirtualize && setScrollTop(event.currentTarget.scrollTop)}
        className="flex-1 overflow-auto py-1"
      >
        {matches ? (
          matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">No files match.</p>
          ) : (
            matches.map((file) => (
              <FileRow
                key={file.path}
                label={file.path}
                depth={0}
                isActive={file.path === activeFilePath}
                isModified={file.isModified}
                isUnreadable={file.isReadable === false}
                monospacePath
                onClick={() => onSelectFile(file.path)}
              />
            ))
          )
        ) : (
          <div
            style={
              shouldVirtualize
                ? { height: rows.length * ROW_HEIGHT, position: 'relative' }
                : undefined
            }
          >
            <div
              style={
                shouldVirtualize
                  ? { position: 'absolute', top: startIndex * ROW_HEIGHT, left: 0, right: 0 }
                  : undefined
              }
            >
              {visibleRows.map(({ node, depth }) =>
                node.isDirectory ? (
                  <DirectoryRow
                    key={node.path}
                    node={node}
                    depth={depth}
                    isCollapsed={collapsed.has(node.path)}
                    onToggle={() => toggle(node.path)}
                  />
                ) : (
                  <FileRow
                    key={node.path}
                    label={node.name}
                    depth={depth}
                    isActive={node.path === activeFilePath}
                    isModified={node.isModified}
                    isUnreadable={node.isReadable === false}
                    onClick={() => onSelectFile(node.path)}
                  />
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const INDENT = 12;

const DirectoryRow: React.FC<{
  node: FileTreeNode;
  depth: number;
  isCollapsed: boolean;
  onToggle: () => void;
}> = ({ node, depth, isCollapsed, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    style={{ paddingLeft: 8 + depth * INDENT, height: ROW_HEIGHT }}
    className="flex w-full items-center gap-1 pr-2 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--fill)]"
  >
    <ChevronRight
      className={cx('h-3 w-3 shrink-0 transition-transform', !isCollapsed && 'rotate-90')}
    />
    <span className="truncate font-medium">{node.name}</span>
  </button>
);

const FileRow: React.FC<{
  label: string;
  depth: number;
  isActive: boolean;
  isModified?: boolean;
  isUnreadable?: boolean;
  monospacePath?: boolean;
  onClick: () => void;
}> = ({ label, depth, isActive, isModified, isUnreadable, monospacePath, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{ paddingLeft: 8 + depth * INDENT + 16, height: ROW_HEIGHT }}
    className={cx(
      'flex w-full items-center gap-1.5 pr-2 text-left text-[12.5px]',
      isActive ? 'bg-[var(--fill-active)] text-[var(--text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--fill)]'
    )}
  >
    <span className={cx('truncate', monospacePath && 'font-mono text-[11.5px]')}>{label}</span>
    {isUnreadable && (
      <FileWarning className="h-3 w-3 shrink-0 text-[var(--warning)]" aria-label="not readable" />
    )}
    {isModified && (
      <span
        className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
        aria-label="modified"
      />
    )}
  </button>
);

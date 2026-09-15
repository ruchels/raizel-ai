'use client';

import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileCode,
  FileText,
  FileJson,
  FileTerminal,
  Search,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { ArtifactFile, FileTreeNode } from '@/types/artifact';
import { buildFileTree } from '@/lib/artifact';

interface FileTreeProps {
  files: ArtifactFile[];
  activeFilePath: string;
  onSelectFile: (path: string) => void;
}

// Icon helper for diverse file types
function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (ext === 'tsx' || ext === 'jsx') {
    return <FileCode className="w-4 h-4 text-sky-400 shrink-0" />;
  }
  if (ext === 'ts' || ext === 'js' || ext === 'mjs') {
    return <FileCode className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  if (ext === 'py') {
    return <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />;
  }
  if (ext === 'css' || ext === 'scss') {
    return <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />;
  }
  if (ext === 'html' || ext === 'svg') {
    return <FileCode className="w-4 h-4 text-rose-400 shrink-0" />;
  }
  if (ext === 'json' || ext === 'yaml' || ext === 'yml') {
    return <FileJson className="w-4 h-4 text-amber-300 shrink-0" />;
  }
  if (ext === 'sh' || ext === 'bash') {
    return <FileTerminal className="w-4 h-4 text-emerald-300 shrink-0" />;
  }
  if (ext === 'md') {
    return <FileText className="w-4 h-4 text-slate-400 shrink-0" />;
  }

  return <FileText className="w-4 h-4 text-slate-400 shrink-0" />;
}

// Filter tree by search query if present
function filterNodes(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  if (!query.trim()) return nodes;
  const lower = query.toLowerCase();

  return nodes
    .map((node) => {
      if (node.isDirectory && node.children) {
        const matchingChildren = filterNodes(node.children, query);
        if (matchingChildren.length > 0) {
          return { ...node, children: matchingChildren };
        }
        if (node.name.toLowerCase().includes(lower)) {
          return node;
        }
        return null;
      }

      if (node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower)) {
        return node;
      }
      return null;
    })
    .filter(Boolean) as FileTreeNode[];
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  activeFilePath,
  onSelectFile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // Build tree from files
  const treeNodes = useMemo(() => buildFileTree(files), [files]);

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const expandAll = () => {
    setCollapsedFolders({});
  };

  const collapseAll = () => {
    const allFolderPaths: Record<string, boolean> = {};
    const collectFolders = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.isDirectory) {
          allFolderPaths[node.path] = true;
          if (node.children) collectFolders(node.children);
        }
      }
    };
    collectFolders(treeNodes);
    setCollapsedFolders(allFolderPaths);
  };

  const displayedNodes = useMemo(
    () => filterNodes(treeNodes, searchQuery),
    [treeNodes, searchQuery]
  );

  const renderNode = (node: FileTreeNode, depth = 0) => {
    const isCollapsed = Boolean(collapsedFolders[node.path]);
    const isActive = !node.isDirectory && node.path === activeFilePath;

    if (node.isDirectory) {
      return (
        <div key={node.path} className="select-none">
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            style={{ paddingLeft: `${Math.max(depth * 14 + 10, 10)}px` }}
            className="w-full flex items-center gap-1.5 py-1.5 px-2 hover:bg-white/[0.04] text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors group cursor-pointer text-left"
          >
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-300 shrink-0" />
            )}

            {isCollapsed ? (
              <Folder className="w-4 h-4 text-indigo-400/80 shrink-0" />
            ) : (
              <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
            )}

            <span className="truncate tracking-wide text-slate-200 group-hover:text-white">
              {node.name}
            </span>
          </button>

          {!isCollapsed && node.children && (
            <div className="relative">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        type="button"
        onClick={() => onSelectFile(node.path)}
        style={{ paddingLeft: `${Math.max(depth * 14 + 22, 18)}px` }}
        className={`w-full flex items-center justify-between py-1.5 px-2 text-xs rounded-lg transition-all text-left cursor-pointer group select-none ${
          isActive
            ? 'bg-indigo-600/20 text-white border-l-2 border-indigo-500 font-medium'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {getFileIcon(node.name)}
          <span className={`truncate ${isActive ? 'text-indigo-200 font-semibold' : ''}`}>
            {node.name}
          </span>
        </div>

        {node.isModified && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
            title="Modified in this session"
          />
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#08090d] border-r border-white/[0.06] w-56 sm:w-64 shrink-0 select-none">
      {/* Search & Tree Actions Toolbar */}
      <div className="p-2.5 border-b border-white/[0.06] space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            Explorer
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandAll}
              className="p-1 rounded hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
              title="Expand all folders"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="p-1 rounded hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
              title="Collapse all folders"
            >
              <ChevronsDownUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
        {displayedNodes.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            {searchQuery ? 'No matching files' : 'Empty project'}
          </div>
        ) : (
          displayedNodes.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  );
};

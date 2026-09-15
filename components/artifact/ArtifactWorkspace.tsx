'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  Sparkles,
  GripVertical,
  Loader2,
  FileCode,
  Layers,
} from 'lucide-react';
import { ArtifactProject } from '@/types/artifact';
import { ArtifactHeader } from './ArtifactHeader';
import { FileTree } from './FileTree';
import { CodeEditor } from './CodeEditor';

interface ArtifactWorkspaceProps {
  project: ArtifactProject | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveFileContent: (path: string, newContent: string) => void;
  onSelectFile: (path: string) => void;
  isGenerating?: boolean;
}

export const ArtifactWorkspace: React.FC<ArtifactWorkspaceProps> = ({
  project,
  isOpen,
  onClose,
  onSaveFileContent,
  onSelectFile,
  isGenerating = false,
}) => {
  const [panelWidth, setPanelWidth] = useState<number>(540);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<'files' | 'code'>('code');

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize width to ~42% of window
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const defaultW = Math.max(340, Math.min(window.innerWidth * 0.42, 680));
      setPanelWidth(defaultW);
    }
  }, []);

  // Drag resize handler
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const windowWidth = window.innerWidth;
      const newWidth = windowWidth - e.clientX;

      // Restrain between min 320px and max 65% of viewport
      const minW = 320;
      const maxW = Math.floor(windowWidth * 0.65);

      if (newWidth >= minW && newWidth <= maxW) {
        setPanelWidth(newWidth);
      }
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!isOpen || !project) {
    return null;
  }

  // Active file lookup
  const activeFile =
    project.files.find((f) => f.path === project.activeFilePath) ||
    project.files[0] ||
    null;

  // Copy hierarchical structure string
  const handleCopyProjectTree = async () => {
    const lines: string[] = [`📦 ${project.name} (${project.files.length} files)`];
    for (const f of project.files) {
      lines.push(`  📄 ${f.path}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      // ignore
    }
  };

  // If user collapsed the panel into a mini dock badge
  if (isCollapsed) {
    return (
      <div className="fixed bottom-20 right-6 z-40 animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-900/90 to-violet-900/90 border border-indigo-400/30 text-white shadow-2xl shadow-indigo-950/80 hover:scale-105 hover:border-indigo-400/60 transition-all cursor-pointer backdrop-blur-xl group"
        >
          <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
          <div className="text-left font-sans">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{project.title || project.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-indigo-200 font-mono">
                {project.files.length}
              </span>
            </div>
            <div className="text-[10px] text-indigo-300/80">Click to expand workspace</div>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-300 group-hover:-translate-x-0.5 transition-transform" />
        </button>
      </div>
    );
  }

  const effectiveWidth = isMaximized ? '80vw' : `${panelWidth}px`;

  return (
    <>
      {/* DESKTOP PANEL (Hidden on small screens) */}
      <div
        ref={containerRef}
        style={{ width: effectiveWidth }}
        className="hidden md:flex h-full flex-col shrink-0 relative bg-[#090b11] border-l border-white/[0.08] shadow-2xl shadow-black/80 z-20 transition-[width] duration-150 ease-out"
      >
        {/* Left Resizable Drag Handle */}
        {!isMaximized && (
          <div
            onMouseDown={handleMouseDown}
            className="absolute left-0 top-0 bottom-0 w-2.5 -translate-x-1.5 cursor-col-resize z-30 group flex items-center justify-center hover:bg-indigo-500/20 transition-colors"
            title="Drag to resize workspace"
          >
            <div className="w-1 h-8 rounded-full bg-white/20 group-hover:bg-indigo-400 transition-colors flex items-center justify-center">
              <GripVertical className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        )}

        {/* Artifact Header */}
        <ArtifactHeader
          project={project}
          isMaximized={isMaximized}
          onToggleMaximize={() => setIsMaximized(!isMaximized)}
          onCollapse={() => setIsCollapsed(true)}
          onClose={onClose}
          onCopyProjectTree={handleCopyProjectTree}
          isDownloadingZip={false}
        />

        {/* Build State Banner if Generating */}
        {isGenerating && (
          <div className="shrink-0 px-4 py-2 bg-indigo-950/40 border-b border-indigo-500/20 text-indigo-300 text-xs flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span className="font-medium">RAIZEL AI is generating project files...</span>
          </div>
        )}

        {/* Main Body: File Tree (Left) + Code Viewer / Editor (Right) */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          <FileTree
            files={project.files}
            activeFilePath={project.activeFilePath}
            onSelectFile={onSelectFile}
          />
          <CodeEditor
            file={activeFile}
            onSaveFileContent={onSaveFileContent}
          />
        </div>
      </div>

      {/* MOBILE FULLSCREEN DRAWER (Visible on < md) */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-[#090b11] text-slate-100 animate-in slide-in-from-right duration-200">
        {/* Mobile Header */}
        <ArtifactHeader
          project={project}
          isMaximized={true}
          onToggleMaximize={() => {}}
          onCollapse={onClose}
          onClose={onClose}
          onCopyProjectTree={handleCopyProjectTree}
        />

        {/* Mobile Tab Bar: Files vs Code */}
        <div className="shrink-0 flex border-b border-white/[0.08] bg-[#06070a] text-xs font-medium">
          <button
            type="button"
            onClick={() => setMobileActiveTab('files')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition-colors ${
              mobileActiveTab === 'files'
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-white/[0.02]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Files ({project.files.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileActiveTab('code')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition-colors ${
              mobileActiveTab === 'code'
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-white/[0.02]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Code {activeFile ? `(${activeFile.name})` : ''}</span>
          </button>
        </div>

        {/* Mobile Content Area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {mobileActiveTab === 'files' ? (
            <div className="flex-1 overflow-auto">
              <FileTree
                files={project.files}
                activeFilePath={project.activeFilePath}
                onSelectFile={(p) => {
                  onSelectFile(p);
                  setMobileActiveTab('code'); // Auto switch to code view upon selecting
                }}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <CodeEditor
                file={activeFile}
                onSaveFileContent={onSaveFileContent}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  Sparkles,
  GripVertical,
  Loader2,
  FileCode,
  Layers,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Wrench,
} from 'lucide-react';
import { ArtifactProject } from '@/types/artifact';
import { ArtifactHeader, ProjectActionType } from './ArtifactHeader';
import { FileTree } from './FileTree';
import { CodeEditor } from './CodeEditor';
import { validateProject, ProjectValidationResult } from '@/lib/validation';

interface ArtifactWorkspaceProps {
  project: ArtifactProject | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveFileContent: (path: string, newContent: string) => void;
  onSelectFile: (path: string) => void;
  isGenerating?: boolean;
  generationStage?: string;
  generationPercent?: number;
  onTriggerProjectAction?: (action: ProjectActionType) => void;
  onAskAiToFix?: (issuesSummary: string) => void;
}

export const ArtifactWorkspace: React.FC<ArtifactWorkspaceProps> = ({
  project,
  isOpen,
  onClose,
  onSaveFileContent,
  onSelectFile,
  isGenerating = false,
  generationStage = 'Generating project files...',
  generationPercent = 50,
  onTriggerProjectAction,
  onAskAiToFix,
}) => {
  const [panelWidth, setPanelWidth] = useState<number>(560);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<'files' | 'code'>('code');

  // Validation Drawer State
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState<ProjectValidationResult | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize width to ~42% of window
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const defaultW = Math.max(360, Math.min(window.innerWidth * 0.44, 720));
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

      // Restrain between min 340px and max 70% of viewport
      const minW = 340;
      const maxW = Math.floor(windowWidth * 0.70);

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

  const handleAction = (action: ProjectActionType) => {
    if (action === 'validate') {
      const res = validateProject(project);
      setValidationResult(res);
      setIsValidationModalOpen(true);
    } else if (onTriggerProjectAction) {
      onTriggerProjectAction(action);
    }
  };

  const handleFixValidationErrors = () => {
    if (!validationResult || !onAskAiToFix) return;
    const errors = validationResult.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `- ${i.filePath || 'project'}: ${i.message}`)
      .join('\n');

    setIsValidationModalOpen(false);
    onAskAiToFix(`Please fix the following validation issues in this project:\n${errors}`);
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

  const effectiveWidth = isMaximized ? '85vw' : `${panelWidth}px`;

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
          onTriggerAction={handleAction}
        />

        {/* Real Generation Stage Banner (Phase 4) */}
        {isGenerating && (
          <div className="shrink-0 px-4 py-2.5 bg-indigo-950/40 border-b border-indigo-500/20 text-indigo-200 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
                <span>Stage: {generationStage}</span>
              </div>
              <span className="font-mono text-[11px] text-indigo-300 font-semibold">{generationPercent}%</span>
            </div>
            <div className="w-full h-1 rounded-full bg-indigo-950/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 rounded-full"
                style={{ width: `${generationPercent}%` }}
              />
            </div>
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
          onTriggerAction={handleAction}
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
                  setMobileActiveTab('code');
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

      {/* Static Validation Modal (Phase 9) */}
      {isValidationModalOpen && validationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl max-h-[85vh] rounded-3xl bg-[#0e121d] border border-white/15 shadow-2xl shadow-black/90 p-5 sm:p-6 flex flex-col text-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08] mb-4">
              <div className="flex items-center gap-2.5">
                {validationResult.isValid ? (
                  <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-white">Project Static Validation</h3>
                  <p className="text-xs text-slate-400">
                    Inspected cross-file imports, JSON schemas, paths & completeness
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsValidationModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-3 gap-2.5 mb-4 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className="text-slate-400 text-[10px] uppercase">Files</div>
                <div className="text-sm font-bold text-white mt-0.5">{validationResult.stats.totalFiles}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className="text-slate-400 text-[10px] uppercase">Imports Checked</div>
                <div className="text-sm font-bold text-indigo-300 mt-0.5">{validationResult.stats.importsChecked}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className="text-slate-400 text-[10px] uppercase">Issues Found</div>
                <div className={`text-sm font-bold mt-0.5 ${validationResult.hasErrors ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {validationResult.stats.issuesCount}
                </div>
              </div>
            </div>

            {/* Summary Banner */}
            <div className={`p-3 rounded-xl mb-4 text-xs ${
              validationResult.isValid
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-200'
            }`}>
              {validationResult.summary}
            </div>

            {/* Issues List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-0">
              {validationResult.issues.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold text-white">All checks passed!</p>
                  <p className="text-[11px] text-slate-500 mt-1">No missing imports, JSON syntax errors, or duplicate path issues detected.</p>
                </div>
              ) : (
                validationResult.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-3 rounded-xl border text-xs ${
                      issue.severity === 'error'
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                        : issue.severity === 'warning'
                        ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                        : 'bg-white/[0.03] border-white/[0.06] text-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        {issue.severity === 'error' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <span>{issue.message}</span>
                      </div>
                      {issue.filePath && (
                        <button
                          type="button"
                          onClick={() => {
                            if (issue.filePath) {
                              onSelectFile(issue.filePath);
                              setIsValidationModalOpen(false);
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-slate-300 font-mono transition-colors cursor-pointer shrink-0"
                          title="View file in editor"
                        >
                          {issue.filePath}{issue.line ? `:${issue.line}` : ''}
                        </button>
                      )}
                    </div>
                    {issue.detail && (
                      <p className="text-[11px] text-slate-400 mt-1 pl-5">
                        {issue.detail}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-white/[0.08] mt-4 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">
                Safe static validation completed &bull; No unsafe server commands run
              </span>
              <div className="flex items-center gap-2">
                {validationResult.hasErrors && onAskAiToFix && (
                  <button
                    type="button"
                    onClick={handleFixValidationErrors}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-950/40 transition-colors cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Ask AI to Fix Errors</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsValidationModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-slate-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

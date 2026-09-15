'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Download,
  FolderArchive,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  FileJson,
  Loader2,
} from 'lucide-react';
import { ArtifactProject } from '@/types/artifact';
import { downloadProjectZip, exportProjectJson } from '@/lib/zip';

interface ArtifactHeaderProps {
  project: ArtifactProject;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onCopyProjectTree: () => void;
  isDownloadingZip?: boolean;
}

export const ArtifactHeader: React.FC<ArtifactHeaderProps> = ({
  project,
  isMaximized,
  onToggleMaximize,
  onCollapse,
  onClose,
  onCopyProjectTree,
  isDownloadingZip = false,
}) => {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [copiedZipFeedback, setCopiedZipFeedback] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownloadZip = async () => {
    try {
      setIsDownloading(true);
      await downloadProjectZip(project);
    } catch (err) {
      console.error('Download ZIP failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExportJson = () => {
    exportProjectJson(project);
    setIsExportMenuOpen(false);
  };

  const handleCopyStructure = () => {
    onCopyProjectTree();
    setCopiedZipFeedback(true);
    setTimeout(() => setCopiedZipFeedback(false), 2000);
    setIsExportMenuOpen(false);
  };

  const fileCount = project.files.length;
  const modifiedCount = project.files.filter((f) => f.isModified).length;

  return (
    <div className="shrink-0 border-b border-white/[0.08] bg-[#090b11]/95 backdrop-blur-md px-4 py-3 select-none">
      {/* Top row: Brand & Window Control Actions */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-indigo-500/15 via-purple-500/15 to-sky-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold tracking-wide shadow-sm shadow-indigo-950/40">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span className="font-mono text-[11px] tracking-wider uppercase">RAIZEL ARTIFACT</span>
          </div>

          {modifiedCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
              ● {modifiedCount} updated
            </span>
          )}
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1 text-slate-400">
          <button
            type="button"
            onClick={onCollapse}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] hover:text-slate-200 transition-colors cursor-pointer"
            title="Collapse workspace"
            aria-label="Collapse workspace"
          >
            <Minimize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMaximize}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] hover:text-slate-200 transition-colors cursor-pointer"
            title={isMaximized ? 'Restore width' : 'Maximize workspace'}
            aria-label={isMaximized ? 'Restore width' : 'Maximize workspace'}
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer"
            title="Close workspace"
            aria-label="Close workspace"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom row: Project Meta & Quick Download Action */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
            <FolderArchive className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
              <span>{project.title || project.name}</span>
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="text-slate-300 font-medium">📦 {project.name}</span>
              <span>•</span>
              <span>{fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={isDownloading || isDownloadingZip}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-950/40 transition-all cursor-pointer"
            title="Download complete project as ZIP"
          >
            {isDownloading || isDownloadingZip ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Zipping...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span> ZIP
              </>
            )}
          </button>

          {/* Export Dropdown Menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="More project actions"
              aria-label="More export actions"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-[#0e121d] border border-white/10 shadow-2xl shadow-black/80 py-1.5 text-xs text-slate-200 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.06] text-left cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Download .ZIP</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportJson}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.06] text-left cursor-pointer transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5 text-amber-400" />
                  <span>Export JSON</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyStructure}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.06] text-left cursor-pointer transition-colors"
                >
                  {copiedZipFeedback ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-sky-400" />
                  )}
                  <span>{copiedZipFeedback ? 'Copied outline!' : 'Copy file tree'}</span>
                </button>

                <div className="my-1 border-t border-white/[0.06]" />

                <div className="px-3 py-1.5 text-[10px] text-slate-400">
                  Version {project.version || 1} • {new Date(project.updatedAt || project.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

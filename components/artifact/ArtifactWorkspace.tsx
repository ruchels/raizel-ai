'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  FileCode,
  GitCompare,
  LayoutList,
  AlertTriangle,
} from 'lucide-react';
import type { AppliedOperation, ArtifactProject } from '@/types/artifact';
import { downloadProjectZip } from '@/lib/zip';
import { validateProject, type ProjectValidationResult } from '@/lib/validation';
import { indexFromProject } from '@/lib/context';
import { formatBytes } from '@/lib/fs/fileTypes';
import { FileTree } from './FileTree';
import { CodeEditor } from './CodeEditor';
import { DiffView } from './DiffView';
import { Badge, Button, EmptyState, IconButton, SectionLabel, cx } from '../ui/primitives';

interface ArtifactWorkspaceProps {
  project: ArtifactProject | null;
  isOpen: boolean;
  isMobile: boolean;
  isGenerating: boolean;
  /** Real progress: files written so far in this generation, or null when unknown. */
  filesWritten: number | null;
  onClose: () => void;
  onSelectFile: (path: string) => void;
  onSaveFile: (path: string, content: string) => void;
  onAskAi: (prompt: string) => void;
}

type Tab = 'files' | 'changes' | 'overview';

const MIN_WIDTH = 360;
const DEFAULT_WIDTH = 560;

export const ArtifactWorkspace: React.FC<ArtifactWorkspaceProps> = ({
  project,
  isOpen,
  isMobile,
  isGenerating,
  filesWritten,
  onClose,
  onSelectFile,
  onSaveFile,
  onAskAi,
}) => {
  const [tab, setTab] = useState<Tab>('files');
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'tree' | 'file'>('tree');

  useEffect(() => {
    const max = Math.floor(window.innerWidth * 0.72);
    setWidth(Math.max(MIN_WIDTH, Math.min(DEFAULT_WIDTH, max)));
  }, []);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const next = window.innerWidth - event.clientX;
    const max = Math.floor(window.innerWidth * 0.75);
    setWidth(Math.max(MIN_WIDTH, Math.min(next, max)));
  }, []);

  const stopResize = useCallback(() => setIsResizing(false), []);

  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onPointerMove, stopResize]);

  const activeFile = useMemo(
    () => project?.files.find((f) => f.path === project.activeFilePath) ?? project?.files[0] ?? null,
    [project]
  );

  const changes = project?.lastChanges ?? [];
  const appliedChanges = changes.filter((c) => c.status === 'applied');

  const handleDownload = async () => {
    if (!project) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadProjectZip(project);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'The archive could not be created.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen || !project) return null;

  const body = (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[var(--text)]">
            {project.title || project.name}
          </p>
          <p className="tabular text-[11px] text-[var(--text-muted)]">
            {project.files.length} files
            {project.origin === 'imported' && ' · imported'}
            {project.version > 1 && ` · v${project.version}`}
          </p>
        </div>

        <Button size="sm" onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">ZIP</span>
        </Button>

        {!isMobile && (
          <IconButton
            label={isMaximized ? 'Restore panel width' : 'Maximize panel'}
            size="sm"
            onClick={() => setIsMaximized((prev) => !prev)}
          >
            {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </IconButton>
        )}
        <IconButton label="Close workspace" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </header>

      {isGenerating && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-muted)]" />
          <span className="text-[12px] text-[var(--text-secondary)]">
            {filesWritten === null
              ? 'Generating…'
              : `Writing files — ${filesWritten} complete so far`}
          </span>
        </div>
      )}

      {downloadError && (
        <p className="shrink-0 border-b border-[var(--border)] bg-[var(--danger-subtle)] px-3 py-1.5 text-[12px] text-[var(--danger)]">
          {downloadError}
        </p>
      )}

      <nav className="flex shrink-0 gap-0.5 border-b border-[var(--border)] px-2">
        {([
          { id: 'files' as Tab, label: 'Files', icon: <FileCode className="h-3.5 w-3.5" /> },
          {
            id: 'changes' as Tab,
            label: 'Changes',
            icon: <GitCompare className="h-3.5 w-3.5" />,
            count: appliedChanges.length,
          },
          { id: 'overview' as Tab, label: 'Overview', icon: <LayoutList className="h-3.5 w-3.5" /> },
        ]).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cx(
              'flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[12.5px] transition-colors',
              tab === item.id
                ? 'border-[var(--text)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            )}
          >
            {item.icon}
            {item.label}
            {'count' in item && item.count ? (
              <span className="tabular rounded-[var(--radius-sm)] bg-[var(--fill)] px-1 text-[10px]">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'files' &&
          (isMobile ? (
            mobilePane === 'tree' ? (
              <FileTree
                files={project.files}
                activeFilePath={project.activeFilePath}
                onSelectFile={(path) => {
                  onSelectFile(path);
                  setMobilePane('file');
                }}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <button
                  type="button"
                  onClick={() => setMobilePane('tree')}
                  className="shrink-0 border-b border-[var(--border)] px-3 py-2 text-left text-[12px] text-[var(--accent-text)]"
                >
                  ← All files
                </button>
                <div className="min-h-0 flex-1">
                  <CodeEditor file={activeFile} onSave={onSaveFile} />
                </div>
              </div>
            )
          ) : (
            <div className="flex h-full min-h-0">
              <div className="w-[220px] shrink-0 border-r border-[var(--border)]">
                <FileTree
                  files={project.files}
                  activeFilePath={project.activeFilePath}
                  onSelectFile={onSelectFile}
                />
              </div>
              <div className="min-w-0 flex-1">
                <CodeEditor file={activeFile} onSave={onSaveFile} />
              </div>
            </div>
          ))}

        {tab === 'changes' && (
          <ChangesTab project={project} onSelectFile={onSelectFile} onOpenFiles={() => setTab('files')} />
        )}

        {tab === 'overview' && <OverviewTab project={project} onAskAi={onAskAi} />}
      </div>
    </div>
  );

  if (isMobile) {
    return <div className="fixed inset-0 z-40 animate-slide-in-right">{body}</div>;
  }

  return (
    <div
      style={{ width: isMaximized ? '75vw' : width }}
      className="relative hidden h-full shrink-0 border-l border-[var(--border)] md:block"
    >
      {!isMaximized && (
        <div
          onPointerDown={(event) => {
            event.preventDefault();
            setIsResizing(true);
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize workspace"
          className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-[var(--accent-subtle)]"
        />
      )}
      {body}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Changes tab                                                         */
/* ------------------------------------------------------------------ */

const OPERATION_LABEL: Record<AppliedOperation['operation'], string> = {
  create_file: 'Created',
  update_file: 'Updated',
  delete_file: 'Deleted',
  rename_file: 'Renamed',
};

const ChangesTab: React.FC<{
  project: ArtifactProject;
  onSelectFile: (path: string) => void;
  onOpenFiles: () => void;
}> = ({ project, onSelectFile, onOpenFiles }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const changes = project.lastChanges ?? [];

  const file = selected ? project.files.find((f) => f.path === selected) : null;

  if (changes.length === 0) {
    return (
      <EmptyState
        icon={<GitCompare className="h-6 w-6" />}
        title="No changes yet"
        description="When RAIZEL edits this project, every file it touches appears here with a diff."
      />
    );
  }

  if (file) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="shrink-0 border-b border-[var(--border)] px-3 py-2 text-left text-[12px] text-[var(--accent-text)]"
        >
          ← All changes
        </button>
        <div className="min-h-0 flex-1">
          <DiffView before={file.previousContent ?? ''} after={file.content} label={file.path} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
        {changes.map((change, index) => {
          const skipped = change.status === 'skipped';
          return (
            <li key={`${change.path}-${index}`}>
              <button
                type="button"
                disabled={skipped || change.operation === 'delete_file'}
                onClick={() => {
                  const target = change.newPath || change.path;
                  if (project.files.some((f) => f.path === target && f.previousContent !== undefined)) {
                    setSelected(target);
                  } else {
                    onSelectFile(target);
                    onOpenFiles();
                  }
                }}
                className={cx(
                  'flex w-full items-start gap-3 px-3 py-2.5 text-left',
                  !skipped && 'hover:bg-[var(--fill)]',
                  skipped && 'cursor-default'
                )}
              >
                <span className="w-14 shrink-0 pt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                  {OPERATION_LABEL[change.operation]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] text-[var(--text)]">
                    {change.newPath ? `${change.path} → ${change.newPath}` : change.path}
                  </span>
                  {change.reason && (
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--text-muted)]">
                      {change.reason}
                    </span>
                  )}
                  {skipped && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--warning)]">
                      <AlertTriangle className="h-3 w-3" />
                      Skipped — {change.skipReason}
                    </span>
                  )}
                </span>
                {!skipped && (
                  <span className="shrink-0 tabular text-[11px]">
                    {change.addedLines > 0 && (
                      <span className="text-[var(--diff-add-text)]">+{change.addedLines}</span>
                    )}{' '}
                    {change.removedLines > 0 && (
                      <span className="text-[var(--diff-del-text)]">−{change.removedLines}</span>
                    )}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Overview tab                                                        */
/* ------------------------------------------------------------------ */

const ACTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Explain architecture',
    prompt:
      'Explain this project: its architecture, how the files connect, how data flows, and where state lives. Reference real file paths.',
  },
  {
    label: 'Find problems',
    prompt:
      'Review this project for real problems: broken imports, missing error handling, race conditions, security issues, and dead code. Cite file and line where you can.',
  },
  {
    label: 'Security review',
    prompt:
      'Do a defensive security review of this project: input validation, authentication, secret handling, dependency risk, and injection surfaces.',
  },
  {
    label: 'Add tests',
    prompt: 'Identify the most valuable things to test in this project, then write those tests.',
  },
];

const OverviewTab: React.FC<{ project: ArtifactProject; onAskAi: (prompt: string) => void }> = ({
  project,
  onAskAi,
}) => {
  const [validation, setValidation] = useState<ProjectValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Rebuilt from current files so the overview is never stale after an edit.
  const manifest = useMemo(() => indexFromProject(project).manifest, [project]);

  const runValidation = () => {
    setIsValidating(true);
    // Yield a frame so the button state paints before the synchronous pass.
    requestAnimationFrame(() => {
      setValidation(validateProject(project));
      setIsValidating(false);
    });
  };

  const unreadable = project.files.filter((f) => f.isReadable === false);

  return (
    <div className="h-full overflow-y-auto p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
        <Row label="Files">
          {manifest.fileCount} · {formatBytes(manifest.totalBytes)}
        </Row>
        <Row label="Readable">
          {manifest.readableCount}
          {manifest.unreadableCount > 0 && (
            <span className="text-[var(--warning)]"> · {manifest.unreadableCount} not read</span>
          )}
        </Row>
        {manifest.stack.length > 0 && <Row label="Stack" span>{manifest.stack.join(', ')}</Row>}
        {manifest.packageManagers.length > 0 && (
          <Row label="Package manager">{manifest.packageManagers.join(', ')}</Row>
        )}
        {manifest.dependencies.length > 0 && (
          <Row label="Dependencies">
            {manifest.dependencies.filter((d) => !d.dev).length} runtime ·{' '}
            {manifest.dependencies.filter((d) => d.dev).length} dev
          </Row>
        )}
        {manifest.entryPoints.length > 0 && (
          <Row label="Entry points" span>
            <span className="font-mono text-[11.5px]">{manifest.entryPoints.join(', ')}</span>
          </Row>
        )}
        {manifest.envVars.length > 0 && (
          <Row label="Env vars" span>
            <span className="font-mono text-[11.5px]">{manifest.envVars.join(', ')}</span>
          </Row>
        )}
      </dl>

      {unreadable.length > 0 && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--warning-subtle)] p-3">
          <p className="text-[12.5px] font-medium text-[var(--text)]">
            {unreadable.length} file{unreadable.length === 1 ? '' : 's'} could not be read
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            These exist in the project but their contents were never decoded, so they were not sent
            to the model: <span className="font-mono">{unreadable.slice(0, 6).map((f) => f.name).join(', ')}</span>
            {unreadable.length > 6 && ` and ${unreadable.length - 6} more`}.
          </p>
        </div>
      )}

      <div className="mt-5">
        <SectionLabel>Static checks</SectionLabel>
        {validation ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)]">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
              <span className="flex items-center gap-2 text-[12.5px] text-[var(--text)]">
                {validation.isValid ? (
                  <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-[var(--danger)]" />
                )}
                {validation.stats.issuesCount === 0
                  ? 'No issues found'
                  : `${validation.stats.issuesCount} issue${validation.stats.issuesCount === 1 ? '' : 's'}`}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setValidation(null)}>
                Clear
              </Button>
            </div>
            <p className="px-3 py-2 text-[12px] text-[var(--text-muted)]">
              Checked {validation.stats.filesChecked} files and {validation.stats.importsChecked}{' '}
              relative imports.
            </p>
            {validation.issues.length > 0 && (
              <ul className="max-h-56 divide-y divide-[var(--border)] overflow-y-auto border-t border-[var(--border)]">
                {validation.issues.map((issue) => (
                  <li key={issue.id} className="px-3 py-2">
                    <p className="flex items-start gap-1.5 text-[12px] text-[var(--text)]">
                      <Badge tone={issue.severity === 'error' ? 'danger' : issue.severity === 'warning' ? 'warning' : 'neutral'}>
                        {issue.severity}
                      </Badge>
                      <span className="min-w-0">{issue.message}</span>
                    </p>
                    {issue.filePath && (
                      <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                        {issue.filePath}
                        {issue.line ? `:${issue.line}` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {validation.hasErrors && (
              <div className="border-t border-[var(--border)] p-3">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    onAskAi(
                      `Fix these validation issues in the project:\n${validation.issues
                        .filter((i) => i.severity === 'error')
                        .map((i) => `- ${i.filePath ?? 'project'}: ${i.message}`)
                        .join('\n')}`
                    )
                  }
                >
                  Ask RAIZEL to fix them
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <Button size="sm" onClick={runValidation} disabled={isValidating}>
              {isValidating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Check imports and JSON
            </Button>
            <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
              Resolves every relative import and parses every JSON file. Nothing is executed and no
              build is run.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5">
        <SectionLabel>Ask about this project</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((action) => (
            <Button key={action.label} size="sm" onClick={() => onAskAi(action.prompt)}>
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode; span?: boolean }> = ({
  label,
  children,
  span,
}) => (
  <div className={cx('min-w-0', span && 'col-span-2')}>
    <dt className="text-[11px] text-[var(--text-muted)]">{label}</dt>
    <dd className="break-words text-[var(--text)]">{children}</dd>
  </div>
);

'use client';

import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  PanelRight,
  RotateCcw,
  Search,
  FileWarning,
  Package,
} from 'lucide-react';
import type { ChatMessage as Message, FileAttachment, MessageChange } from '@/types/chat';
import { getModelInfo } from '@/lib/models';
import { formatFileSize } from '@/lib/files';
import { stripArtifactMarkup } from '@/lib/artifact';
import { stripToolCalls } from '@/lib/project/tools';
import { Badge, IconButton, cx } from './ui/primitives';

interface ChatMessageProps {
  message: Message;
  showTimestamp: boolean;
  isStreaming?: boolean;
  onRetry?: () => void;
  onOpenWorkspace?: () => void;
  onOpenFile?: (path: string) => void;
}

/* ------------------------------------------------------------------ */
/* Code block                                                          */
/* ------------------------------------------------------------------ */

function nodeToText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return nodeToText(props.children);
  }
  return '';
}

const CodeBlock: React.FC<{ language: string; raw: string; children: React.ReactNode }> = ({
  language,
  raw,
  children,
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `snippet.${language || 'txt'}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 200);
  };

  const lineCount = raw.split('\n').length;

  return (
    <figure className="my-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--code-bg)]">
      <figcaption className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-1.5">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          {language || 'text'}
          {lineCount > 1 && <span className="ml-2 tabular">{lineCount} lines</span>}
        </span>
        <span className="flex items-center gap-0.5">
          {lineCount > 12 && (
            <IconButton label="Download snippet" size="sm" onClick={download}>
              <Download className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton label={copied ? 'Copied' : 'Copy code'} size="sm" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
          </IconButton>
        </span>
      </figcaption>
      <div className="overflow-x-auto p-3">
        <pre className="code-surface m-0 bg-transparent p-0">
          <code className={cx('hljs', language && `language-${language}`)}>{children}</code>
        </pre>
      </div>
    </figure>
  );
};

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

const AttachmentChip: React.FC<{ attachment: FileAttachment; onPreview: () => void }> = ({
  attachment,
  onPreview,
}) => {
  const failed = attachment.status === 'failed';
  const partial = attachment.status === 'partial';

  const icon = failed ? (
    <FileWarning className="h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
  ) : attachment.type === 'image' ? (
    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
  ) : attachment.type === 'zip' ? (
    <Package className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
  ) : (
    <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
  );

  const meta = failed
    ? 'not read'
    : attachment.type === 'zip'
      ? `${attachment.fileCount ?? 0} files`
      : attachment.lineCount
        ? `${attachment.lineCount} lines`
        : formatFileSize(attachment.size);

  return (
    <button
      type="button"
      onClick={onPreview}
      title={attachment.statusDetail || attachment.name}
      className={cx(
        'flex max-w-[15rem] items-center gap-2 rounded-[var(--radius)] border px-2 py-1.5 text-left transition-colors',
        failed
          ? 'border-[var(--danger)]/40 bg-[var(--danger-subtle)]'
          : 'border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--fill)]'
      )}
    >
      {attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt=""
          className="h-6 w-6 shrink-0 rounded-[var(--radius-sm)] object-cover"
        />
      ) : (
        icon
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-[var(--text)]">
          {attachment.name}
        </span>
        <span
          className={cx(
            'block text-[11px] tabular',
            failed ? 'text-[var(--danger)]' : partial ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'
          )}
        >
          {meta}
        </span>
      </span>
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* Changes                                                             */
/* ------------------------------------------------------------------ */

const OPERATION_LABEL: Record<MessageChange['operation'], string> = {
  create_file: 'Created',
  update_file: 'Updated',
  delete_file: 'Deleted',
  rename_file: 'Renamed',
};

const ChangeList: React.FC<{
  changes: MessageChange[];
  onOpenFile?: (path: string) => void;
}> = ({ changes, onOpenFile }) => (
  <div className="my-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
    <div className="border-b border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5">
      <span className="text-[12px] font-medium text-[var(--text-secondary)]">
        {changes.length} file {changes.length === 1 ? 'change' : 'changes'}
      </span>
    </div>
    <ul className="divide-y divide-[var(--border)]">
      {changes.map((change, index) => (
        <li key={`${change.path}-${index}`}>
          <button
            type="button"
            onClick={() => onOpenFile?.(change.newPath || change.path)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--fill)]"
          >
            <span className="w-14 shrink-0 text-[11px] font-medium text-[var(--text-muted)]">
              {OPERATION_LABEL[change.operation]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[12px] text-[var(--text)]">
                {change.newPath ? `${change.path} → ${change.newPath}` : change.path}
              </span>
              {change.reason && (
                <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">
                  {change.reason}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular text-[11px]">
              {change.addedLines > 0 && (
                <span className="text-[var(--diff-add-text)]">+{change.addedLines}</span>
              )}
              {change.addedLines > 0 && change.removedLines > 0 && ' '}
              {change.removedLines > 0 && (
                <span className="text-[var(--diff-del-text)]">−{change.removedLines}</span>
              )}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          </button>
        </li>
      ))}
    </ul>
  </div>
);

/* ------------------------------------------------------------------ */
/* Message                                                             */
/* ------------------------------------------------------------------ */

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  showTimestamp,
  isStreaming,
  onRetry,
  onOpenWorkspace,
  onOpenFile,
}) => {
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<FileAttachment | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  const isUser = message.role === 'user';

  const prose = useMemo(
    () => stripToolCalls(stripArtifactMarkup(message.content)),
    [message.content]
  );

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(prose || message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const timestamp = showTimestamp
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  /* --- error --- */
  if (message.isError) {
    return (
      <div className="py-3">
        <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-subtle)] p-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-relaxed text-[var(--text)]">{message.content}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent-text)] hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* --- user --- */
  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-2 py-3">
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex max-w-full flex-wrap justify-end gap-1.5">
            {message.attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                attachment={attachment}
                onPreview={() => setPreview(attachment)}
              />
            ))}
          </div>
        )}

        {message.content && (
          <div className="group flex max-w-[88%] items-start gap-1.5 sm:max-w-[80%]">
            <IconButton
              label="Copy message"
              size="sm"
              onClick={copyMessage}
              className="mt-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
            </IconButton>
            <div className="min-w-0 whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--fill)] px-3.5 py-2.5 text-[15px] leading-relaxed text-[var(--text)]">
              {message.content}
            </div>
          </div>
        )}

        {message.memoryWrites && message.memoryWrites.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {message.memoryWrites.map((write) => (
              <span
                key={write.id}
                className="inline-flex max-w-[20rem] items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
                title={write.content}
              >
                <Brain className="h-3 w-3 shrink-0" />
                <span className="truncate">Remembered: {write.content}</span>
              </span>
            ))}
          </div>
        )}

        {preview && <AttachmentPreview attachment={preview} onClose={() => setPreview(null)} />}
      </div>
    );
  }

  /* --- assistant --- */
  const modelName = getModelInfo(message.model || '')?.name;
  const hasBody = prose.length > 0;

  return (
    <div className="group py-3">
      {(modelName || timestamp) && (
        <div className="mb-1.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          {modelName && <span>{modelName}</span>}
          {timestamp && <span className="tabular">{timestamp}</span>}
        </div>
      )}

      {message.reasoning && (
        <div className="mb-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setReasoningOpen((prev) => !prev)}
            className="flex w-full items-center gap-2 bg-[var(--bg-subtle)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--fill)]"
          >
            <Brain className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Reasoning</span>
            <ChevronRight className={cx('h-3.5 w-3.5 transition-transform', reasoningOpen && 'rotate-90')} />
          </button>
          {reasoningOpen && (
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap border-t border-[var(--border)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {message.reasoning}
            </div>
          )}
        </div>
      )}

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {message.toolCalls.map((call, index) => (
            <span
              key={`${call.tool}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
            >
              <Search className="h-3 w-3" />
              <span className="font-mono">{call.tool}</span>
              <span className="max-w-[12rem] truncate text-[var(--text-muted)]">{call.target}</span>
              {!call.ok && <span className="text-[var(--danger)]">failed</span>}
            </span>
          ))}
        </div>
      )}

      {hasBody ? (
        <div className="prose-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              pre: ({ children }) => <>{children}</>,
              table: ({ children }) => (
                <div className="table-scroll">
                  <table>{children}</table>
                </div>
              ),
              a: ({ children, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              code: ({ className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || '');
                const raw = nodeToText(children);
                if (match || raw.includes('\n')) {
                  return (
                    <CodeBlock language={match?.[1] ?? ''} raw={raw.replace(/\n$/, '')}>
                      {children}
                    </CodeBlock>
                  );
                }
                return (
                  <code
                    className="rounded-[var(--radius-sm)] bg-[var(--fill)] px-1 py-0.5 text-[var(--text)]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {prose}
          </ReactMarkdown>
        </div>
      ) : (
        !isStreaming &&
        (message.changes?.length ? null : (
          <p className="text-[13px] italic text-[var(--text-muted)]">No text in this response.</p>
        ))
      )}

      {isStreaming && (
        <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-[var(--text)] animate-dot" />
      )}

      {message.changes && message.changes.length > 0 && (
        <ChangeList changes={message.changes} onOpenFile={onOpenFile} />
      )}

      {message.artifactSummary && (
        <button
          type="button"
          onClick={onOpenWorkspace}
          className="mt-3 flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 py-3 text-left transition-colors hover:bg-[var(--fill)]"
        >
          <PanelRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-[var(--text)]">
              {message.artifactSummary.title || message.artifactSummary.name}
            </span>
            <span className="block text-[12px] text-[var(--text-muted)]">
              {message.artifactSummary.fileCount} files in the workspace
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        </button>
      )}

      {message.noActionWarning && (
        <div className="mt-3 flex gap-2.5 rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-subtle)] p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <p className="text-[12.5px] leading-relaxed text-[var(--text)]">{message.noActionWarning}</p>
        </div>
      )}

      {message.memoryWrites && message.memoryWrites.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {message.memoryWrites.map((write) => (
            <Badge key={write.id}>
              <Brain className="h-3 w-3" />
              <span className="max-w-[18rem] truncate">Remembered: {write.content}</span>
            </Badge>
          ))}
        </div>
      )}

      {!isStreaming && hasBody && (
        <div className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconButton label={copied ? 'Copied' : 'Copy response'} size="sm" onClick={copyMessage}>
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
          </IconButton>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Attachment preview                                                  */
/* ------------------------------------------------------------------ */

const AttachmentPreview: React.FC<{ attachment: FileAttachment; onClose: () => void }> = ({
  attachment,
  onClose,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-[var(--bg-overlay)]" onClick={onClose} />
    <div className="relative flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-raised)] shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--text)]">{attachment.name}</p>
          <p className="text-[12px] text-[var(--text-muted)]">
            {formatFileSize(attachment.size)}
            {attachment.lineCount ? ` · ${attachment.lineCount} lines` : ''}
          </p>
        </div>
        <IconButton label="Close preview" size="sm" onClick={onClose}>
          <ChevronRight className="h-4 w-4 rotate-90" />
        </IconButton>
      </div>

      {attachment.statusDetail && (
        <p
          className={cx(
            'border-b border-[var(--border)] px-4 py-2 text-[12px]',
            attachment.status === 'failed' ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'
          )}
        >
          {attachment.statusDetail}
        </p>
      )}

      <div className="flex-1 overflow-auto">
        {attachment.type === 'image' && attachment.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachment.previewUrl} alt={attachment.name} className="mx-auto max-h-[60dvh] object-contain p-4" />
        ) : attachment.type === 'zip' ? (
          <ul className="p-4 font-mono text-[12px] text-[var(--text-secondary)]">
            {(attachment.extractedFiles ?? []).slice(0, 500).map((path) => (
              <li key={path} className="truncate">
                {path}
              </li>
            ))}
          </ul>
        ) : attachment.content ? (
          <pre className="code-surface whitespace-pre-wrap p-4 text-[var(--text-secondary)]">
            {attachment.content}
          </pre>
        ) : (
          <p className="p-6 text-center text-[13px] text-[var(--text-muted)]">
            Nothing was extracted from this file.
          </p>
        )}
      </div>
    </div>
  </div>
);

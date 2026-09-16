'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Loader2,
  Paperclip,
  Square,
  X,
  FileText,
  Image as ImageIcon,
  Package,
  FileWarning,
} from 'lucide-react';
import type { FileAttachment } from '@/types/chat';
import { processUploadedFile, createPastedSnippetAttachment, formatFileSize } from '@/lib/files';
import { ACCEPTED_UPLOAD_TYPES } from '@/lib/fs/fileTypes';
import { IconButton, cx } from './ui/primitives';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (attachments: FileAttachment[], archives: Map<string, File>) => void;
  isLoading: boolean;
  onStop: () => void;
  enterToSend: boolean;
  placeholder?: string;
}

interface PendingUpload {
  id: string;
  name: string;
  size: number;
}

/** Text this long is moved out of the composer into an attachment chip. */
const PASTE_THRESHOLD_CHARS = 800;
const PASTE_THRESHOLD_LINES = 20;

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  isLoading,
  onStop,
  enterToSend,
  placeholder = 'Message RAIZEL',
}) => {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  /**
   * Archives are kept here rather than on the attachment so the raw File
   * survives until submit; FileAttachment must stay JSON-serialisable.
   */
  const archivesRef = useRef<Map<string, File>>(new Map());

  // Grow with content up to a ceiling, then scroll internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const canSend = !isLoading && (value.trim().length > 0 || attachments.length > 0);

  const send = useCallback(() => {
    if (!canSend) return;
    const current = attachments;
    const archives = new Map(archivesRef.current);
    setAttachments([]);
    archivesRef.current = new Map();
    onSubmit(current, archives);
  }, [canSend, attachments, onSubmit]);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;

    const files = Array.from(fileList);
    const placeholders: PendingUpload[] = files.map((file, index) => ({
      id: `pending_${Date.now()}_${index}`,
      name: file.name,
      size: file.size,
    }));
    setPending((prev) => [...prev, ...placeholders]);

    // Sequential: PDF and DOCX parsing is CPU-bound and would jank the tab.
    for (let i = 0; i < files.length; i++) {
      try {
        const processed = await processUploadedFile(files[i]);
        if (processed.type === 'zip' && processed.status !== 'failed') {
          archivesRef.current.set(processed.id, files[i]);
        }
        setAttachments((prev) => [...prev, processed]);
      } catch (error) {
        setAttachments((prev) => [
          ...prev,
          {
            id: `att_failed_${Date.now()}_${i}`,
            name: files[i].name,
            type: 'document',
            size: files[i].size,
            mimeType: files[i].type || 'application/octet-stream',
            status: 'failed',
            statusDetail: error instanceof Error ? error.message : 'The file could not be processed.',
          },
        ]);
      } finally {
        setPending((prev) => prev.filter((p) => p.id !== placeholders[i].id));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (event.clipboardData.files.length > 0) {
      event.preventDefault();
      void handleFiles(event.clipboardData.files);
      return;
    }

    const text = event.clipboardData.getData('text');
    if (!text) return;
    if (text.length >= PASTE_THRESHOLD_CHARS || text.split('\n').length >= PASTE_THRESHOLD_LINES) {
      event.preventDefault();
      setAttachments((prev) => [...prev, createPastedSnippetAttachment(text)]);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const shouldSend = enterToSend
      ? event.key === 'Enter' && !event.shiftKey
      : event.key === 'Enter' && (event.metaKey || event.ctrlKey);

    if (shouldSend) {
      event.preventDefault();
      send();
    }
  };

  const iconFor = (attachment: FileAttachment) => {
    if (attachment.status === 'failed') return <FileWarning className="h-3.5 w-3.5 text-[var(--danger)]" />;
    if (attachment.type === 'image') return <ImageIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />;
    if (attachment.type === 'zip') return <Package className="h-3.5 w-3.5 text-[var(--text-muted)]" />;
    return <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />;
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4 sm:pb-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_UPLOAD_TYPES}
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setIsDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cx(
          'rounded-[var(--radius-lg)] border bg-[var(--bg-raised)] shadow-[var(--shadow)] transition-colors',
          isDragging
            ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
            : 'border-[var(--border)] focus-within:border-[var(--border-strong)]'
        )}
      >
        {(attachments.length > 0 || pending.length > 0) && (
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] p-2">
            {attachments.map((attachment) => {
              const failed = attachment.status === 'failed';
              return (
                <div
                  key={attachment.id}
                  title={attachment.statusDetail || attachment.name}
                  className={cx(
                    'flex max-w-[14rem] items-center gap-2 rounded-[var(--radius)] border py-1 pl-2 pr-1',
                    failed
                      ? 'border-[var(--danger)]/40 bg-[var(--danger-subtle)]'
                      : 'border-[var(--border)] bg-[var(--bg-subtle)]'
                  )}
                >
                  {attachment.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.previewUrl}
                      alt=""
                      className="h-5 w-5 shrink-0 rounded-[var(--radius-sm)] object-cover"
                    />
                  ) : (
                    iconFor(attachment)
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-[var(--text)]">{attachment.name}</span>
                    <span
                      className={cx(
                        'block text-[11px] tabular',
                        failed ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'
                      )}
                    >
                      {failed
                        ? 'could not be read'
                        : attachment.type === 'zip'
                          ? `${attachment.readableCount ?? 0}/${attachment.fileCount ?? 0} readable`
                          : attachment.lineCount
                            ? `${attachment.lineCount} lines`
                            : formatFileSize(attachment.size)}
                    </span>
                  </span>
                  <IconButton
                    label={`Remove ${attachment.name}`}
                    size="sm"
                    onClick={() => {
                      archivesRef.current.delete(attachment.id);
                      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
                    }}
                  >
                    <X className="h-3 w-3" />
                  </IconButton>
                </div>
              );
            })}

            {pending.map((item) => (
              <div
                key={item.id}
                className="flex max-w-[14rem] items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1.5"
              >
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-muted)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-[var(--text)]">{item.name}</span>
                  <span className="block text-[11px] tabular text-[var(--text-muted)]">
                    reading {formatFileSize(item.size)}…
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5 p-2">
          <IconButton
            label="Attach files"
            disabled={isLoading}
            onClick={() => fileInputRef.current?.click()}
            className="mb-0.5"
          >
            <Paperclip className="h-4 w-4" />
          </IconButton>

          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={attachments.length > 0 ? 'Add instructions (optional)' : placeholder}
            className="max-h-[220px] min-h-[36px] flex-1 resize-none self-center bg-transparent py-2 text-[15px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
          />

          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--fill-active)] text-[var(--text)] transition-colors hover:bg-[var(--fill-hover)]"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              aria-label="Send message"
              title="Send message"
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--accent)] text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:bg-[var(--fill-active)] disabled:text-[var(--text-muted)]"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
        {enterToSend ? 'Shift + Enter for a new line' : 'Ctrl + Enter to send'}
      </p>
    </div>
  );
};

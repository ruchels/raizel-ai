'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  ArrowUp,
  Square,
  Paperclip,
  X,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  FileText,
  Eye,
} from 'lucide-react';
import { FileAttachment } from '@/types/chat';
import {
  processUploadedFile,
  createPastedSnippetAttachment,
  formatFileSize,
} from '@/lib/files';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (attachments: FileAttachment[]) => void;
  isLoading: boolean;
  onStop: () => void;
  placeholder?: string;
  enterToSend?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSubmit,
  isLoading,
  onStop,
  placeholder = 'Ask RAIZEL AI...',
  enterToSend = true,
}) => {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<FileAttachment | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea according to scrollHeight
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (enterToSend && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && (input.trim() || attachments.length > 0)) {
        handleSend();
      }
    }
  };

  const handleSend = () => {
    if (isLoading || (!input.trim() && attachments.length === 0)) return;
    const currentAttachments = [...attachments];
    setAttachments([]);
    onSubmit(currentAttachments);
  };

  // Claude-Style Paste Interception for Large Text
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;

    const lineCount = pasted.split('\n').length;
    // If text has >= 800 chars or >= 20 lines, compress into a file attachment
    if (pasted.length >= 800 || lineCount >= 20) {
      e.preventDefault();
      const snippet = createPastedSnippetAttachment(pasted);
      setAttachments((prev) => [...prev, snippet]);
    }
  };

  // Process selected files from input or drag-drop
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    for (const file of filesArray) {
      try {
        const processed = await processUploadedFile(file);
        setAttachments((prev) => [...prev, processed]);
      } catch (err) {
        console.error('Error processing file:', err);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const getAttachmentIcon = (att: FileAttachment) => {
    if (att.type === 'image') return <ImageIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    if (att.type === 'zip') return <FileArchive className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    if (att.name.includes('.')) return <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 pb-3 sm:pb-5">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.zip,.txt,.js,.ts,.tsx,.jsx,.py,.html,.css,.json,.md,.c,.cpp,.java,.sql,.yaml,.yml"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFilesSelected(e.dataTransfer.files);
        }}
        className={`relative rounded-2xl sm:rounded-3xl bg-[#111420]/90 border shadow-2xl shadow-black/80 backdrop-blur-xl transition-all duration-200 ${
          isDragging
            ? 'border-indigo-500 bg-indigo-950/20'
            : 'border-white/10 focus-within:border-indigo-500/50'
        }`}
      >
        {/* Attached Files & Claude-Style Snippets Row */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-1 border-b border-white/[0.06]">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 text-xs text-slate-200 transition-all max-w-[240px] sm:max-w-[280px]"
              >
                {att.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="w-5 h-5 rounded object-cover shrink-0"
                  />
                ) : (
                  getAttachmentIcon(att)
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[11px] sm:text-xs">
                    {att.name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {att.lineCount
                      ? `${att.lineCount} lines • ${formatFileSize(att.size)}`
                      : att.extractedFiles
                      ? `${att.extractedFiles.length} files • ${formatFileSize(att.size)}`
                      : formatFileSize(att.size)}
                  </div>
                </div>

                {/* Inspect button for text/snippets */}
                {att.content && (
                  <button
                    type="button"
                    onClick={() => setPreviewAttachment(att)}
                    className="p-1 rounded text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer"
                    title="View content"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            attachments.length > 0
              ? 'Add instructions for the attached file(s)...'
              : placeholder
          }
          className="w-full resize-none bg-transparent pt-3.5 pb-12 pl-12 pr-14 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:outline-none max-h-48 leading-relaxed"
          style={{ minHeight: '52px' }}
        />

        {/* Attachment (Paperclip) Button */}
        <div className="absolute left-2.5 bottom-2.5 flex items-center">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] text-slate-400 hover:text-indigo-300 disabled:opacity-40 transition-all cursor-pointer group"
            title="Attach images, .zip, or code documents"
          >
            <Paperclip className="w-4 h-4 group-hover:rotate-45 transition-transform" />
          </button>
        </div>

        {/* Send / Stop Buttons */}
        <div className="absolute right-2.5 bottom-2.5 flex items-center gap-2">
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-all duration-150 cursor-pointer flex items-center justify-center group"
              title="Stop generation"
            >
              <Square className="w-4 h-4 text-rose-400 fill-rose-400 group-hover:scale-95 transition-transform" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white transition-all duration-150 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center shadow-md shadow-indigo-600/30"
              title="Send message"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>

        <div className="absolute left-12 bottom-2 text-[10px] text-slate-400 select-none hidden sm:block">
          Use <kbd className="px-1 py-0.5 rounded bg-white/5 font-mono text-[9px] text-slate-300">Shift + Enter</kbd> for newline &bull; Paste large code to auto-compress
        </div>
      </div>

      <div className="text-center mt-2">
        <p className="text-[11px] text-slate-400 tracking-wide">
          RAIZEL AI &bull; Powered by Ruchel Afwa Mabrur
        </p>
      </div>

      {/* Snippet / File Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl max-h-[80vh] rounded-3xl bg-[#0e121d] border border-white/10 shadow-2xl shadow-black/90 p-5 flex flex-col text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-3">
              <div className="flex items-center gap-2">
                {getAttachmentIcon(previewAttachment)}
                <span className="font-semibold text-white text-sm">
                  {previewAttachment.name}
                </span>
                <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded bg-white/5">
                  {previewAttachment.lineCount
                    ? `${previewAttachment.lineCount} lines`
                    : formatFileSize(previewAttachment.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto rounded-xl bg-[#08090d] border border-white/[0.06] p-4 text-xs font-mono text-slate-300 leading-relaxed whitespace-pre">
              {previewAttachment.content || '(No preview content available)'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

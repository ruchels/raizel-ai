'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  User,
  AlertTriangle,
  FileCode,
  FileArchive,
  FileText,
  Image as ImageIcon,
  X,
  Eye,
  Brain,
  ChevronDown,
} from 'lucide-react';
import { ChatMessage as ChatMessageType, FileAttachment } from '@/types/chat';
import { getModelInfo } from '@/lib/models';
import { formatFileSize } from '@/lib/files';

interface ChatMessageProps {
  message: ChatMessageType;
  onRetry?: () => void;
  isLatestAssistant?: boolean;
}

interface CodeBlockProps {
  language: string;
  rawCode: string;
  children: React.ReactNode;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) {
    return node.map(extractText).join('');
  }
  if (React.isValidElement(node)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return extractText((node.props as any)?.children);
  }
  return '';
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, rawCode, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API unavailable
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-white/10 bg-[#090b11] shadow-lg shadow-black/40 text-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-white/[0.04] border-b border-white/[0.08] text-slate-400">
        <span className="font-mono font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto font-mono leading-relaxed text-[13px]">
        <pre className="!bg-transparent !p-0 !m-0">
          <code className={language ? `language-${language} hljs` : 'hljs'}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
};

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onRetry,
}) => {
  const isUser = message.role === 'user';
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<FileAttachment | null>(null);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch {
      // ignore
    }
  };

  const getAttachmentIcon = (att: FileAttachment) => {
    if (att.type === 'image') return <ImageIcon className="w-3.5 h-3.5 text-indigo-300 shrink-0" />;
    if (att.type === 'zip') return <FileArchive className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
    if (att.name.includes('.')) return <FileCode className="w-3.5 h-3.5 text-emerald-300 shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-sky-300 shrink-0" />;
  };

  const modelInfo = message.model ? getModelInfo(message.model) : undefined;
  const modelDisplayName = modelInfo?.name || message.model || 'RAIZEL AI';

  if (message.isError) {
    return (
      <div className="w-full flex justify-start my-3 px-2 sm:px-0">
        <div className="flex gap-3 max-w-2xl rounded-2xl bg-rose-950/30 border border-rose-500/30 p-4 text-rose-200 backdrop-blur-md">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1 text-sm">
            <p className="font-medium text-rose-300">{message.content}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-semibold text-rose-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="w-full flex justify-end my-3 px-2 sm:px-0">
        <div className="flex gap-2 max-w-[85%] sm:max-w-xl group">
          <div className="flex flex-col items-end">
            {/* Render Attached Files / Snippets */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2 mb-2">
                {message.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.08] border border-white/15 text-xs text-white max-w-[260px]"
                  >
                    {att.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        onClick={() => setPreviewAttachment(att)}
                        className="w-8 h-8 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                      />
                    ) : (
                      getAttachmentIcon(att)
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[11px]">
                        {att.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {att.lineCount
                          ? `${att.lineCount} lines • ${formatFileSize(att.size)}`
                          : formatFileSize(att.size)}
                      </div>
                    </div>
                    {att.content && (
                      <button
                        type="button"
                        onClick={() => setPreviewAttachment(att)}
                        className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title="View snippet content"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {message.content && (
              <div className="rounded-2xl rounded-tr-sm px-4 py-3 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-950/30 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {message.content}
              </div>
            )}

            <div className="mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleCopyMessage}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 p-1 rounded cursor-pointer"
                title="Copy prompt"
              >
                {copiedMessage ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedMessage ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center shrink-0 text-indigo-300">
            <User className="w-4 h-4" />
          </div>
        </div>

        {/* Attachment Lightbox / Modal */}
        {previewAttachment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
            <div className="relative w-full max-w-2xl max-h-[80vh] rounded-3xl bg-[#0e121d] border border-white/10 shadow-2xl shadow-black/90 p-5 flex flex-col text-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-3">
                <div className="flex items-center gap-2">
                  {getAttachmentIcon(previewAttachment)}
                  <span className="font-semibold text-white text-sm">
                    {previewAttachment.name}
                  </span>
                  <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded bg-white/5">
                    {formatFileSize(previewAttachment.size)}
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

              {previewAttachment.type === 'image' && previewAttachment.previewUrl ? (
                <div className="flex-1 overflow-auto flex items-center justify-center p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewAttachment.previewUrl}
                    alt={previewAttachment.name}
                    className="max-h-[60vh] max-w-full rounded-xl object-contain"
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-auto rounded-xl bg-[#08090d] border border-white/[0.06] p-4 text-xs font-mono text-slate-300 leading-relaxed whitespace-pre">
                  {previewAttachment.content || '(No content)'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Assistant Message
  return (
    <div className="w-full flex justify-start my-3 px-2 sm:px-0 group">
      <div className="flex gap-3 max-w-[95%] sm:max-w-3xl">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20 text-white font-bold text-xs mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-300">
              {modelDisplayName}
            </span>
            {message.createdAt && (
              <span className="text-[10px] text-slate-500">
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          {/* Collapsible Thinking / Reasoning Process */}
          {message.reasoning && (
            <div className="mb-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                className="w-full flex items-center justify-between px-3.5 py-2 bg-white/[0.02] hover:bg-white/[0.05] text-indigo-300 font-medium cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Thinking Process</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    isThinkingExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isThinkingExpanded && (
                <div className="p-3.5 border-t border-white/[0.06] text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto bg-black/20">
                  {message.reasoning}
                </div>
              )}
            </div>
          )}

          <div className="markdown-body text-sm text-slate-200 leading-relaxed break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre({ children }) {
                  return <>{children}</>;
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                code({ className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const rawCode = extractText(children);
                  const isMultiLine = rawCode.includes('\n');

                  if (match || isMultiLine) {
                    return (
                      <CodeBlock
                        language={match ? match[1] : ''}
                        rawCode={rawCode}
                      >
                        {children}
                      </CodeBlock>
                    );
                  }
                  return (
                    <code
                      className="px-1.5 py-0.5 rounded bg-white/[0.08] text-indigo-200 font-mono text-[12px] border border-white/[0.06]"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>

          <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/[0.05] transition-colors cursor-pointer"
              title="Copy message"
            >
              {copiedMessage ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import type { MemorySettings } from './memory';

export type Role = 'user' | 'assistant' | 'system';

export type AttachmentType = 'image' | 'text' | 'zip' | 'document';

/**
 * `status` is the honesty contract for attachments:
 *  - ready   : content was fully extracted and is available to the model
 *  - partial : some of it was extracted; statusDetail says what was missed
 *  - failed  : nothing was read; statusDetail says why
 * The UI must render this rather than implying every upload was understood.
 */
export type AttachmentStatus = 'ready' | 'partial' | 'failed';

export interface FileAttachment {
  id: string;
  name: string;
  type: AttachmentType;
  size: number;
  mimeType: string;
  status: AttachmentStatus;
  /** Human-readable explanation of the status. Shown verbatim in the UI. */
  statusDetail?: string;
  /** Base64 data URL for images, extracted text for documents. */
  content?: string;
  previewUrl?: string;
  lineCount?: number;
  language?: string;
  /** ZIP only: normalized paths found inside the archive. */
  extractedFiles?: string[];
  fileCount?: number;
  readableCount?: number;
}

/** A single file change produced by the assistant in one turn. */
export interface MessageChange {
  operation: 'create_file' | 'update_file' | 'delete_file' | 'rename_file';
  path: string;
  newPath?: string;
  addedLines: number;
  removedLines: number;
  reason?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  model?: string;
  isError?: boolean;
  attachments?: FileAttachment[];
  reasoning?: string;
  /** Set when this turn produced workspace changes. */
  changes?: MessageChange[];
  artifactSummary?: {
    name: string;
    title: string;
    fileCount: number;
  };
  /** Memories written during this turn, so the UI can show them honestly. */
  memoryWrites?: Array<{ id: string; content: string }>;
  /** Files the model requested via read_file/search tools while answering. */
  toolCalls?: Array<{ tool: string; target: string; ok: boolean }>;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** Schema version, used by the storage migration path. */
  schemaVersion?: number;
}

export type ModelProvider = 'Claude' | 'Grok' | 'DeepSeek' | 'Kimi' | 'GLM';

export interface ModelInfo {
  id: string;
  name: string;
  provider: ModelProvider;
  family?: string;
  description: string;
  badge?: string;
  isDefault?: boolean;
}

export type ThemePreference = 'dark' | 'light' | 'system';

export interface UserSettings {
  theme: ThemePreference;
  enterToSend: boolean;
  showTimestamps: boolean;
  saveHistory: boolean;
  defaultModel: string;
  /** Auto-open the workspace panel when the assistant writes files. */
  autoOpenWorkspace: boolean;
  /** Allow the model to request extra files mid-answer (costs one extra round trip). */
  allowFileRequests: boolean;
  memory: MemorySettings;
}

export interface ChatRequestPayload {
  model: string;
  messages: Array<{
    role: Role;
    content: string;
    attachments?: FileAttachment[];
  }>;
  stream?: boolean;
  systemContext?: string;
}

export type Role = 'user' | 'assistant' | 'system';

export interface FileAttachment {
  id: string;
  name: string;
  type: 'image' | 'text' | 'zip' | 'document';
  size: number;
  mimeType: string;
  content?: string; // base64 for images or extracted text for documents/zip
  previewUrl?: string; // data URL or thumbnail
  lineCount?: number;
  extractedFiles?: string[]; // for zip: list of extracted files
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
  artifactId?: string;
  hasArtifact?: boolean;
  artifactSummary?: {
    name: string;
    fileCount: number;
    title: string;
  };
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  currentArtifactId?: string;
  createdAt: number;
  updatedAt: number;
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

export interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  enterToSend: boolean;
  showTimestamps: boolean;
  saveHistory: boolean;
  defaultModel: string;
}

export interface ChatRequestPayload {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  stream?: boolean;
}

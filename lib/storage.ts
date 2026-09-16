import type { ChatMessage, Conversation, FileAttachment, UserSettings } from '@/types/chat';
import type { ArtifactProject } from '@/types/artifact';
import { DEFAULT_MEMORY_SETTINGS } from '@/types/memory';
import { DEFAULT_MODEL_ID, isValidModel } from '@/lib/models';

const KEYS = {
  CONVERSATIONS: 'raizel_ai_conversations',
  ACTIVE_ID: 'raizel_ai_active_conv_id',
  SETTINGS: 'raizel_ai_settings',
  ARTIFACTS: 'raizel_ai_artifacts',
} as const;

/** Bump when the persisted shape changes; `migrateConversation` handles the upgrade. */
export const CURRENT_SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  enterToSend: true,
  showTimestamps: false,
  saveHistory: true,
  defaultModel: DEFAULT_MODEL_ID,
  autoOpenWorkspace: true,
  allowFileRequests: true,
  memory: DEFAULT_MEMORY_SETTINGS,
};

function isClient(): boolean {
  return typeof window !== 'undefined';
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* Migration                                                           */
/* ------------------------------------------------------------------ */

/**
 * v1 -> v2:
 *  - attachments gained a required `status` field; anything with content is
 *    treated as 'ready', anything without as 'failed' (it was never readable).
 *  - `hasArtifact` / `artifactId` were replaced by `changes` + `artifactSummary`.
 *  - `currentArtifactId` moved onto the artifact record itself.
 */
type LegacyAttachment = Partial<Omit<FileAttachment, 'id' | 'name' | 'size'>> & {
  id?: string;
  name?: string;
  size?: number;
};

type LegacyMessage = Partial<Omit<ChatMessage, 'id' | 'attachments'>> & {
  id?: string;
  /** Removed in v2; replaced by `changes` + `artifactSummary`. */
  hasArtifact?: boolean;
  artifactId?: string;
  attachments?: LegacyAttachment[];
};

type LegacyConversation = Partial<Omit<Conversation, 'id' | 'messages'>> & {
  id?: string;
  /** Removed in v2; the artifact record owns this now. */
  currentArtifactId?: string;
  messages?: LegacyMessage[];
};

function migrateAttachment(att: LegacyAttachment): FileAttachment | null {
  if (!att?.id || !att.name) return null;
  const hasContent = typeof att.content === 'string' && att.content.length > 0;
  return {
    id: att.id,
    name: att.name,
    type: att.type ?? 'text',
    size: att.size ?? 0,
    mimeType: att.mimeType ?? 'text/plain',
    status: att.status ?? (hasContent || att.type === 'zip' ? 'ready' : 'failed'),
    statusDetail:
      att.statusDetail ??
      (hasContent || att.type === 'zip' ? undefined : 'Saved before RAIZEL recorded extraction results.'),
    content: att.content,
    previewUrl: att.previewUrl,
    lineCount: att.lineCount,
    language: att.language,
    extractedFiles: att.extractedFiles,
    fileCount: att.fileCount ?? att.extractedFiles?.length,
    readableCount: att.readableCount,
  };
}

function migrateConversation(raw: LegacyConversation): Conversation | null {
  if (!raw?.id || typeof raw.id !== 'string') return null;

  const messages: ChatMessage[] = (raw.messages ?? [])
    .filter((m): m is LegacyMessage => Boolean(m?.id && m.role))
    .map((m) => ({
      id: m.id as string,
      role: m.role as ChatMessage['role'],
      content: typeof m.content === 'string' ? m.content : '',
      createdAt: m.createdAt ?? Date.now(),
      model: m.model,
      isError: m.isError,
      reasoning: m.reasoning,
      attachments: m.attachments
        ?.map(migrateAttachment)
        .filter((a): a is FileAttachment => a !== null),
      changes: m.changes,
      artifactSummary: m.artifactSummary,
      memoryWrites: m.memoryWrites,
      toolCalls: m.toolCalls,
    }));

  const model = raw.model && isValidModel(raw.model) ? raw.model : DEFAULT_MODEL_ID;

  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    model,
    messages,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? Date.now(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/* ------------------------------------------------------------------ */
/* Conversations                                                       */
/* ------------------------------------------------------------------ */

export function loadConversations(): Conversation[] {
  if (!isClient()) return [];
  const parsed = safeParse<unknown>(localStorage.getItem(KEYS.CONVERSATIONS), []);
  if (!Array.isArray(parsed)) return [];

  const migrated = parsed
    .map((c) => migrateConversation(c as LegacyConversation))
    .filter((c): c is Conversation => c !== null);

  return migrated.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveConversations(conversations: Conversation[]): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(conversations));
  } catch (err) {
    // Quota exceeded: drop the oldest conversations rather than losing everything.
    console.warn('[storage] conversation quota exceeded, pruning oldest', err);
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    for (let keep = Math.floor(sorted.length / 2); keep >= 1; keep = Math.floor(keep / 2)) {
      try {
        localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(sorted.slice(0, keep)));
        return;
      } catch {
        /* keep shrinking */
      }
    }
  }
}

export function loadActiveConversationId(): string | null {
  if (!isClient()) return null;
  return localStorage.getItem(KEYS.ACTIVE_ID);
}

export function saveActiveConversationId(id: string | null): void {
  if (!isClient()) return;
  if (id) localStorage.setItem(KEYS.ACTIVE_ID, id);
  else localStorage.removeItem(KEYS.ACTIVE_ID);
}

export function clearConversationStorage(): void {
  if (!isClient()) return;
  localStorage.removeItem(KEYS.CONVERSATIONS);
  localStorage.removeItem(KEYS.ACTIVE_ID);
  localStorage.removeItem(KEYS.ARTIFACTS);
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function loadSettings(): UserSettings {
  if (!isClient()) return DEFAULT_SETTINGS;
  const stored = safeParse<Partial<UserSettings>>(localStorage.getItem(KEYS.SETTINGS), {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    memory: { ...DEFAULT_MEMORY_SETTINGS, ...(stored.memory ?? {}) },
  };
}

export function saveSettings(settings: UserSettings): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.warn('[storage] could not persist settings', err);
  }
}

/* ------------------------------------------------------------------ */
/* Artifacts                                                           */
/* ------------------------------------------------------------------ */

/**
 * Artifacts are large. They are stored separately from conversations so a
 * single oversized project cannot take the chat history down with it.
 */
const ARTIFACT_BUDGET_BYTES = 4 * 1024 * 1024;

export function loadArtifacts(): Record<string, ArtifactProject> {
  if (!isClient()) return {};
  const parsed = safeParse<Record<string, ArtifactProject>>(localStorage.getItem(KEYS.ARTIFACTS), {});
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  // Older records lack `isReadable`; treat their files as readable text.
  for (const project of Object.values(parsed)) {
    project.files = (project.files || []).map((f) => ({ ...f, isReadable: f.isReadable !== false }));
  }
  return parsed;
}

export function saveArtifacts(map: Record<string, ArtifactProject>): void {
  if (!isClient()) return;

  const attempt = (candidate: Record<string, ArtifactProject>): boolean => {
    try {
      localStorage.setItem(KEYS.ARTIFACTS, JSON.stringify(candidate));
      return true;
    } catch {
      return false;
    }
  };

  const serialized = JSON.stringify(map);
  if (serialized.length <= ARTIFACT_BUDGET_BYTES && attempt(map)) return;

  // Over budget: keep the most recently updated projects only.
  const entries = Object.entries(map).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  for (let keep = Math.max(1, Math.floor(entries.length / 2)); keep >= 1; keep--) {
    const pruned = Object.fromEntries(entries.slice(0, keep));
    if (attempt(pruned)) {
      console.warn(`[storage] artifact quota exceeded; kept the ${keep} most recent project(s)`);
      return;
    }
  }
  console.warn('[storage] unable to persist artifacts: quota exceeded or storage disabled');
}

export function saveArtifactForConversation(
  conversationId: string,
  artifact: ArtifactProject | null
): void {
  const map = loadArtifacts();
  if (artifact) map[conversationId] = artifact;
  else delete map[conversationId];
  saveArtifacts(map);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function generateTitleFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#*`_~>]/g, '')
    .trim();
  const firstLine = cleaned.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
  if (!firstLine) return 'New chat';
  if (firstLine.length <= 48) return firstLine;
  const cut = firstLine.slice(0, 48);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

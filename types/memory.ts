/**
 * Long-term memory types for RAIZEL AI.
 *
 * Long-term memory is intentionally separate from conversation history:
 *  - Conversation history = the literal transcript of a chat (types/chat.ts)
 *  - Long-term memory     = durable facts that should survive across chats
 */

export type MemoryCategory =
  | 'preference'
  | 'profile'
  | 'project'
  | 'instruction'
  | 'workflow'
  | 'technical';

export type MemorySource = 'explicit' | 'auto' | 'manual';

export interface MemoryItem {
  id: string;
  /** Short, self-contained statement, e.g. "Prefers TypeScript over JavaScript". */
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  createdAt: number;
  updatedAt: number;
  /** 1 (nice to know) .. 5 (must always apply). */
  importance: number;
  /** Disabled items stay stored but are never injected into the model context. */
  enabled: boolean;
  /** Lowercased tokens used for cheap lexical retrieval. */
  keywords: string[];
  /** Conversation the memory originated from, when known. */
  conversationId?: string;
  lastUsedAt?: number;
  useCount: number;
}

export interface MemorySettings {
  /** Master switch. When false nothing is written and nothing is retrieved. */
  enabled: boolean;
  /** When false, only explicit "remember ..." commands create memories. */
  autoCapture: boolean;
  /** Hard cap on stored items; lowest-value items are evicted first. */
  maxItems: number;
  /** Max items injected into a single request. */
  retrievalLimit: number;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  autoCapture: true,
  maxItems: 300,
  retrievalLimit: 12,
};

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: 'Preference',
  profile: 'Profile',
  project: 'Project',
  instruction: 'Instruction',
  workflow: 'Workflow',
  technical: 'Technical',
};

/**
 * Result of running the memory command detector over a user message.
 * `directives` are actions the user explicitly asked for.
 */
export interface MemoryCommandResult {
  directives: MemoryDirective[];
  /** True when the user asked to *see* their memory rather than change it. */
  wantsRecall: boolean;
}

export type MemoryDirective =
  | { kind: 'remember'; content: string }
  | { kind: 'forget'; query: string }
  | { kind: 'forget_all' }
  | { kind: 'do_not_remember' };

/**
 * Storage abstraction so memory can move from localStorage to a server
 * database later without touching any calling code.
 */
export interface MemoryStore {
  list(): Promise<MemoryItem[]>;
  put(item: MemoryItem): Promise<void>;
  putMany(items: MemoryItem[]): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

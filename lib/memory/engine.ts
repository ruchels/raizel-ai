import type {
  MemoryCategory,
  MemoryCommandResult,
  MemoryDirective,
  MemoryItem,
  MemorySource,
} from '@/types/memory';
import { isUnsafeForMemory } from '@/lib/security/secrets';

/**
 * Turns conversation text into durable memory, and durable memory back into
 * context. Deliberately conservative: a wrong memory follows the user around
 * for every future chat, so ambiguous statements are not captured.
 */

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'this', 'that', 'with', 'from', 'into', 'you', 'are', 'was', 'use',
  'prefer', 'prefers', 'always', 'never', 'user', 'saya', 'kamu', 'yang', 'untuk', 'dengan',
  'lebih', 'suka', 'selalu', 'jangan', 'pakai', 'gunakan', 'adalah', 'ini', 'itu', 'dan',
]);

function deriveKeywords(content: string): string[] {
  const tokens = content
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens)).slice(0, 12);
}

function inferCategory(content: string): MemoryCategory {
  const lower = content.toLowerCase();
  if (/\b(name|call me|nama|panggil|timezone|located|tinggal|works? at|bekerja)\b/.test(lower)) return 'profile';
  if (/\b(project|repo|codebase|aplikasi|proyek)\b/.test(lower)) return 'project';
  if (/\b(always|never|jangan|selalu|harus|must|should)\b/.test(lower)) return 'instruction';
  if (/\b(workflow|process|deploy|review|commit|branch|alur)\b/.test(lower)) return 'workflow';
  if (/\b(typescript|javascript|python|react|next|tailwind|postgres|docker|framework|library|stack|database)\b/.test(lower)) {
    return 'technical';
  }
  return 'preference';
}

export function createMemoryItem(
  content: string,
  options: {
    category?: MemoryCategory;
    source?: MemorySource;
    importance?: number;
    conversationId?: string;
  } = {}
): MemoryItem {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  const now = Date.now();
  return {
    id: `mem_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    content: trimmed,
    category: options.category ?? inferCategory(trimmed),
    source: options.source ?? 'manual',
    createdAt: now,
    updatedAt: now,
    importance: options.importance ?? (options.source === 'explicit' ? 4 : 3),
    enabled: true,
    keywords: deriveKeywords(trimmed),
    conversationId: options.conversationId,
    useCount: 0,
  };
}

/** Rejects content that must never reach long-term storage. */
export function validateMemoryContent(content: string): { ok: boolean; reason?: string } {
  const trimmed = content.trim();
  if (trimmed.length < 3) return { ok: false, reason: 'the note is empty' };
  if (trimmed.length > 500) return { ok: false, reason: 'the note is longer than 500 characters' };

  const unsafe = isUnsafeForMemory(trimmed);
  if (unsafe.unsafe) return { ok: false, reason: unsafe.reason };

  return { ok: true };
}

/** Near-duplicate detection so repeated phrasing does not fill the store. */
export function findDuplicate(items: MemoryItem[], content: string): MemoryItem | undefined {
  const normalized = content.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));
  if (tokens.size === 0) return undefined;

  for (const item of items) {
    const otherNorm = item.content.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (otherNorm === normalized) return item;

    const otherTokens = new Set(otherNorm.split(/\s+/).filter(Boolean));
    let shared = 0;
    for (const token of tokens) if (otherTokens.has(token)) shared++;
    const overlap = shared / Math.max(tokens.size, otherTokens.size);
    if (overlap >= 0.8) return item;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Explicit user commands                                              */
/* ------------------------------------------------------------------ */

const REMEMBER_PATTERNS: RegExp[] = [
  /(?:^|\.\s+)(?:tolong\s+)?ingat(?:lah)?\s+(?:bahwa\s+|kalau\s+|jika\s+)?(.+?)(?:\.|$)/i,
  /(?:^|\.\s+)(?:please\s+)?remember\s+(?:that\s+|this[:,]?\s+)?(.+?)(?:\.|$)/i,
  /(?:^|\.\s+)simpan\s+(?:ke\s+)?(?:memory|memori|ingatan)[:,]?\s+(.+?)(?:\.|$)/i,
  /(?:^|\.\s+)save\s+to\s+memory[:,]?\s+(.+?)(?:\.|$)/i,
  /(?:^|\.\s+)catat\s+(?:bahwa\s+)?(.+?)(?:\.|$)/i,
];

const FORGET_PATTERNS: RegExp[] = [
  /(?:^|\.\s+)lupakan\s+(.+?)(?:\.|$)/i,
  /(?:^|\.\s+)forget\s+(?:about\s+)?(.+?)(?:\.|$)/i,
  /(?:^|\.\s+)hapus\s+(?:memory|memori|ingatan)\s+(?:tentang\s+)?(.+?)(?:\.|$)/i,
  /(?:^|\.\s+)delete\s+(?:the\s+)?memory\s+(?:about\s+)?(.+?)(?:\.|$)/i,
];

const FORGET_ALL_PATTERNS: RegExp[] = [
  /\b(?:hapus|bersihkan|reset)\s+(?:semua|seluruh)\s+(?:memory|memori|ingatan)\b/i,
  /\b(?:clear|delete|wipe|reset)\s+(?:all|my|the entire)\s+(?:memory|memories)\b/i,
];

const DO_NOT_REMEMBER_PATTERNS: RegExp[] = [
  /\bjangan\s+(?:di)?ingat(?:\s+(?:ini|itu|yang\s+ini))?\b/i,
  /\b(?:do\s*n['o]?t|don't|never)\s+remember\s+(?:this|that|it)?\b/i,
  /\bjangan\s+simpan\s+(?:ini|itu)?\s*(?:ke\s+)?(?:memory|memori)?\b/i,
];

const RECALL_PATTERNS: RegExp[] = [
  /\bapa\s+(?:saja\s+)?yang\s+(?:kamu|kau|anda)\s+ingat\b/i,
  /\btampilkan\s+(?:memory|memori|ingatan)(?:\s+saya)?\b/i,
  /\bwhat\s+do\s+you\s+remember\b/i,
  /\bshow\s+(?:me\s+)?(?:my\s+)?(?:memory|memories)\b/i,
  /\blist\s+(?:my\s+)?(?:memory|memories)\b/i,
];

const TRAILING_NOISE = /\s*(?:ya|yah|dong|please|thanks|makasih|terima kasih)[.!]?$/i;

function cleanCaptured(raw: string): string {
  return raw
    .trim()
    .replace(TRAILING_NOISE, '')
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rewrites first-person phrasing into a stable third-person memory statement. */
export function normalizeToMemoryStatement(raw: string): string {
  let text = cleanCaptured(raw);
  if (!text) return text;

  const replacements: Array<[RegExp, string]> = [
    [/^saya\s+(lebih\s+suka|suka|prefer)\s+/i, 'Prefers '],
    [/^aku\s+(lebih\s+suka|suka)\s+/i, 'Prefers '],
    [/^i\s+(?:really\s+)?prefer\s+/i, 'Prefers '],
    [/^i\s+like\s+/i, 'Likes '],
    [/^i\s+(?:always\s+)?use\s+/i, 'Uses '],
    [/^saya\s+(?:selalu\s+)?(?:pakai|menggunakan|gunakan)\s+/i, 'Uses '],
    [/^saya\s+/i, 'User '],
    [/^aku\s+/i, 'User '],
    [/^i\s+am\s+/i, 'User is '],
    [/^i'?m\s+/i, 'User is '],
    [/^i\s+/i, 'User '],
    [/^my\s+/i, "User's "],
    [/^nama\s+saya\s+/i, 'User name is '],
    [/^panggil\s+saya\s+/i, 'Prefers to be called '],
    [/^call\s+me\s+/i, 'Prefers to be called '],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      break;
    }
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function parseMemoryCommands(message: string): MemoryCommandResult {
  const directives: MemoryDirective[] = [];
  const text = message.trim();

  if (FORGET_ALL_PATTERNS.some((re) => re.test(text))) {
    directives.push({ kind: 'forget_all' });
  }

  if (DO_NOT_REMEMBER_PATTERNS.some((re) => re.test(text))) {
    directives.push({ kind: 'do_not_remember' });
  }

  if (!directives.some((d) => d.kind === 'forget_all')) {
    for (const pattern of FORGET_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const query = cleanCaptured(match[1]);
        if (query.length >= 2) directives.push({ kind: 'forget', query });
        break;
      }
    }
  }

  if (!directives.some((d) => d.kind === 'do_not_remember')) {
    for (const pattern of REMEMBER_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const content = normalizeToMemoryStatement(match[1]);
        if (content.length >= 3) directives.push({ kind: 'remember', content });
        break;
      }
    }
  }

  return {
    directives,
    wantsRecall: RECALL_PATTERNS.some((re) => re.test(text)),
  };
}

/* ------------------------------------------------------------------ */
/* Automatic capture                                                   */
/* ------------------------------------------------------------------ */

/**
 * Conservative auto-capture. Only fires on statements that are unambiguously
 * durable preferences or constraints — not on task instructions like
 * "add a button here".
 */
const AUTO_CAPTURE_PATTERNS: Array<{ re: RegExp; importance: number }> = [
  { re: /(?:^|[.!?]\s+)saya\s+lebih\s+suka\s+(.{4,160}?)(?:[.!?]|$)/i, importance: 4 },
  { re: /(?:^|[.!?]\s+)i\s+prefer\s+(.{4,160}?)(?:[.!?]|$)/i, importance: 4 },
  { re: /(?:^|[.!?]\s+)(?:selalu|always)\s+(?:gunakan|pakai|use)\s+(.{3,160}?)(?:[.!?]|$)/i, importance: 5 },
  { re: /(?:^|[.!?]\s+)jangan\s+(?:pernah\s+)?(?:gunakan|pakai)\s+(.{3,160}?)(?:[.!?]|$)/i, importance: 5 },
  { re: /(?:^|[.!?]\s+)never\s+use\s+(.{3,160}?)(?:[.!?]|$)/i, importance: 5 },
  { re: /(?:^|[.!?]\s+)(?:panggil\s+saya|call\s+me)\s+(.{2,40}?)(?:[.!?]|$)/i, importance: 4 },
  { re: /(?:^|[.!?]\s+)nama\s+saya\s+(?:adalah\s+)?(.{2,40}?)(?:[.!?]|$)/i, importance: 4 },
  { re: /(?:^|[.!?]\s+)my\s+name\s+is\s+(.{2,40}?)(?:[.!?]|$)/i, importance: 4 },
  { re: /(?:^|[.!?]\s+)(?:project|proyek)\s+ini\s+(?:menggunakan|pakai)\s+(.{3,160}?)(?:[.!?]|$)/i, importance: 4 },
  { re: /(?:^|[.!?]\s+)this\s+project\s+uses\s+(.{3,160}?)(?:[.!?]|$)/i, importance: 4 },
  { re: /(?:^|[.!?]\s+)(?:balas|jawab|respond|reply)\s+(?:selalu\s+)?(?:dalam|in)\s+(bahasa\s+\w+|\w+)(?:[.!?]|$)/i, importance: 5 },
];

export interface CaptureCandidate {
  content: string;
  importance: number;
}

export function findAutoCaptureCandidates(message: string): CaptureCandidate[] {
  const candidates: CaptureCandidate[] = [];
  const seen = new Set<string>();

  for (const { re, importance } of AUTO_CAPTURE_PATTERNS) {
    const match = message.match(re);
    if (!match) continue;
    const whole = cleanCaptured(match[0]);
    const content = normalizeToMemoryStatement(whole);
    const key = content.toLowerCase();
    if (content.length < 6 || seen.has(key)) continue;
    seen.add(key);
    candidates.push({ content, importance });
  }

  return candidates.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* Model-emitted memory tags                                           */
/* ------------------------------------------------------------------ */

const MEMORY_TAG_RE = /<raizel_memory\b([^>]*?)(?:\/>|>([\s\S]*?)<\/raizel_memory>)/gi;

export interface ParsedMemoryTag {
  content: string;
  category?: MemoryCategory;
  importance?: number;
}

const VALID_CATEGORIES: MemoryCategory[] = [
  'preference', 'profile', 'project', 'instruction', 'workflow', 'technical',
];

export function parseMemoryTags(text: string): { tags: ParsedMemoryTag[]; cleanText: string } {
  const tags: ParsedMemoryTag[] = [];
  MEMORY_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MEMORY_TAG_RE.exec(text)) !== null) {
    const attrs = match[1] || '';
    const inline = match[2]?.trim();
    const contentAttr = /content\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    const content = (inline || contentAttr || '').trim();
    if (!content) continue;

    const categoryRaw = /category\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] as MemoryCategory | undefined;
    const importanceRaw = /importance\s*=\s*"?(\d)"?/i.exec(attrs)?.[1];

    tags.push({
      content,
      category: categoryRaw && VALID_CATEGORIES.includes(categoryRaw) ? categoryRaw : undefined,
      importance: importanceRaw ? Math.min(5, Math.max(1, Number(importanceRaw))) : undefined,
    });
  }

  return { tags: tags.slice(0, 5), cleanText: text.replace(MEMORY_TAG_RE, '').trim() };
}

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */
/* ------------------------------------------------------------------ */

export interface RetrievedMemory {
  item: MemoryItem;
  score: number;
}

/**
 * Scores memories against the current message. Instructions and high-importance
 * items always carry a baseline so standing rules ("always use TypeScript")
 * survive even when the message does not mention them.
 */
export function retrieveMemories(
  items: MemoryItem[],
  query: string,
  limit: number
): RetrievedMemory[] {
  const enabled = items.filter((i) => i.enabled);
  if (enabled.length === 0) return [];

  const lowerQuery = query.toLowerCase();
  const queryTokens = new Set(
    lowerQuery.split(/[^a-z0-9+#.-]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  );

  const scored: RetrievedMemory[] = enabled.map((item) => {
    let score = 0;

    // Standing rules apply regardless of topic.
    if (item.category === 'instruction' || item.category === 'workflow') score += 30;
    if (item.category === 'profile') score += 24;
    score += item.importance * 8;

    let hits = 0;
    for (const keyword of item.keywords) {
      if (queryTokens.has(keyword) || lowerQuery.includes(keyword)) hits++;
    }
    score += hits * 25;

    const contentWords = item.content.toLowerCase().split(/\s+/);
    for (const token of queryTokens) {
      if (contentWords.some((w) => w.includes(token))) score += 6;
    }

    score += Math.min(item.useCount, 6) * 2;

    return { item, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .filter((r) => r.score > 20);
}

export function formatMemoriesForModel(retrieved: RetrievedMemory[]): string {
  if (retrieved.length === 0) return '';
  const lines = retrieved.map((r) => `- [${r.item.category}] ${r.item.content}`);
  return [
    'WHAT YOU REMEMBER ABOUT THIS USER',
    '(Durable facts from previous conversations. Apply them when relevant; do not',
    'recite them back unless asked. If one conflicts with the current message,',
    'the current message wins.)',
    ...lines,
  ].join('\n');
}

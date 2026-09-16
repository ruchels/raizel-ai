import type { MemoryItem, MemorySettings, MemoryStore } from '@/types/memory';
import { DEFAULT_MEMORY_SETTINGS } from '@/types/memory';

/**
 * Storage layer for long-term memory.
 *
 * `MemoryStore` is an async interface on purpose: today it is backed by
 * localStorage, but swapping in a server/database implementation later means
 * writing one new class here and changing nothing else in the app.
 */

const MEMORY_KEY = 'raizel_ai_memory_v1';
const MEMORY_SETTINGS_KEY = 'raizel_ai_memory_settings_v1';
/** Legacy keys checked once during migration. */
const LEGACY_KEYS = ['raizel_ai_memories'];

function isClient(): boolean {
  return typeof window !== 'undefined';
}

function isMemoryItem(value: unknown): value is MemoryItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<MemoryItem>;
  return typeof item.id === 'string' && typeof item.content === 'string';
}

/** Fills in fields added after an item was first written. */
function hydrate(item: MemoryItem): MemoryItem {
  return {
    ...item,
    category: item.category ?? 'preference',
    source: item.source ?? 'manual',
    createdAt: item.createdAt ?? Date.now(),
    updatedAt: item.updatedAt ?? item.createdAt ?? Date.now(),
    importance: typeof item.importance === 'number' ? item.importance : 3,
    enabled: item.enabled !== false,
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    useCount: typeof item.useCount === 'number' ? item.useCount : 0,
  };
}

export class LocalMemoryStore implements MemoryStore {
  private cache: MemoryItem[] | null = null;

  private read(): MemoryItem[] {
    if (!isClient()) return [];
    if (this.cache) return this.cache;

    let raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) {
      for (const legacy of LEGACY_KEYS) {
        const legacyRaw = localStorage.getItem(legacy);
        if (legacyRaw) {
          raw = legacyRaw;
          localStorage.setItem(MEMORY_KEY, legacyRaw);
          localStorage.removeItem(legacy);
          break;
        }
      }
    }

    if (!raw) {
      this.cache = [];
      return this.cache;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      this.cache = Array.isArray(parsed) ? parsed.filter(isMemoryItem).map(hydrate) : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private write(items: MemoryItem[]): void {
    this.cache = items;
    if (!isClient()) return;
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(items));
    } catch (err) {
      console.warn('[memory] could not persist to localStorage', err);
    }
  }

  async list(): Promise<MemoryItem[]> {
    return [...this.read()];
  }

  async put(item: MemoryItem): Promise<void> {
    const items = this.read();
    const index = items.findIndex((i) => i.id === item.id);
    if (index >= 0) items[index] = item;
    else items.push(item);
    this.write(items);
  }

  async putMany(incoming: MemoryItem[]): Promise<void> {
    const items = this.read();
    for (const item of incoming) {
      const index = items.findIndex((i) => i.id === item.id);
      if (index >= 0) items[index] = item;
      else items.push(item);
    }
    this.write(items);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((i) => i.id !== id));
  }

  async clear(): Promise<void> {
    this.write([]);
  }
}

export const memoryStore: MemoryStore = new LocalMemoryStore();

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function loadMemorySettings(): MemorySettings {
  if (!isClient()) return DEFAULT_MEMORY_SETTINGS;
  try {
    const raw = localStorage.getItem(MEMORY_SETTINGS_KEY);
    if (!raw) return DEFAULT_MEMORY_SETTINGS;
    return { ...DEFAULT_MEMORY_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_MEMORY_SETTINGS;
  }
}

export function saveMemorySettings(settings: MemorySettings): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(MEMORY_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[memory] could not persist settings', err);
  }
}

/* ------------------------------------------------------------------ */
/* Eviction                                                            */
/* ------------------------------------------------------------------ */

/**
 * Keeps the store under `maxItems` by dropping the least valuable entries:
 * low importance, rarely used, oldest. Explicit user memories are protected.
 */
export function selectForEviction(items: MemoryItem[], maxItems: number): string[] {
  if (items.length <= maxItems) return [];

  const ranked = [...items].sort((a, b) => {
    const valueA = a.importance * 2 + Math.min(a.useCount, 5) + (a.source === 'explicit' ? 4 : 0);
    const valueB = b.importance * 2 + Math.min(b.useCount, 5) + (b.source === 'explicit' ? 4 : 0);
    if (valueA !== valueB) return valueA - valueB;
    return (a.lastUsedAt ?? a.updatedAt) - (b.lastUsedAt ?? b.updatedAt);
  });

  return ranked.slice(0, items.length - maxItems).map((i) => i.id);
}

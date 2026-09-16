'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MemoryCategory, MemoryItem, MemorySettings } from '@/types/memory';
import { memoryStore, selectForEviction } from '@/lib/memory/store';
import {
  createMemoryItem,
  findAutoCaptureCandidates,
  findDuplicate,
  parseMemoryCommands,
  parseMemoryTags,
  validateMemoryContent,
} from '@/lib/memory/engine';

/**
 * Single entry point for memory in the UI.
 *
 * Every mutation goes through here so the store, the in-memory list, and what
 * the user sees in Settings can never disagree.
 */

export interface MemoryWriteOutcome {
  saved: MemoryItem[];
  /** Items that were rejected, with the reason shown to the user. */
  rejected: Array<{ content: string; reason: string }>;
  removed: MemoryItem[];
  clearedAll: boolean;
  /** True when the user asked to see their memory this turn. */
  recallRequested: boolean;
}

const EMPTY_OUTCOME: MemoryWriteOutcome = {
  saved: [],
  rejected: [],
  removed: [],
  clearedAll: false,
  recallRequested: false,
};

export function useMemory(settings: MemorySettings) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    memoryStore.list().then((loaded) => {
      if (cancelled) return;
      setItems(loaded);
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: MemoryItem[]) => {
    setItems(next);
    await memoryStore.clear();
    await memoryStore.putMany(next);
  }, []);

  /* --- CRUD --- */

  const addMemory = useCallback(
    async (
      content: string,
      options: { category?: MemoryCategory; importance?: number; conversationId?: string; source?: MemoryItem['source'] } = {}
    ): Promise<{ ok: true; item: MemoryItem } | { ok: false; reason: string }> => {
      const validation = validateMemoryContent(content);
      if (!validation.ok) return { ok: false, reason: validation.reason ?? 'the note could not be saved' };

      const current = await memoryStore.list();
      const duplicate = findDuplicate(current, content);
      if (duplicate) {
        const refreshed: MemoryItem = {
          ...duplicate,
          content: content.trim(),
          importance: Math.max(duplicate.importance, options.importance ?? duplicate.importance),
          enabled: true,
          updatedAt: Date.now(),
        };
        await memoryStore.put(refreshed);
        setItems(await memoryStore.list());
        return { ok: true, item: refreshed };
      }

      const item = createMemoryItem(content, { ...options, source: options.source ?? 'manual' });
      await memoryStore.put(item);

      let next = await memoryStore.list();
      const evict = selectForEviction(next, settings.maxItems);
      if (evict.length > 0) {
        for (const id of evict) await memoryStore.remove(id);
        next = await memoryStore.list();
      }

      setItems(next);
      return { ok: true, item };
    },
    [settings.maxItems]
  );

  const updateMemory = useCallback(async (id: string, patch: Partial<MemoryItem>) => {
    const current = await memoryStore.list();
    const existing = current.find((i) => i.id === id);
    if (!existing) return;
    const next = { ...existing, ...patch, updatedAt: Date.now() };
    await memoryStore.put(next);
    setItems(await memoryStore.list());
  }, []);

  const toggleMemory = useCallback(
    async (id: string) => {
      const existing = items.find((i) => i.id === id);
      if (!existing) return;
      await updateMemory(id, { enabled: !existing.enabled });
    },
    [items, updateMemory]
  );

  const deleteMemory = useCallback(async (id: string) => {
    await memoryStore.remove(id);
    setItems(await memoryStore.list());
  }, []);

  const clearMemory = useCallback(async () => {
    await memoryStore.clear();
    setItems([]);
  }, []);

  /** Records that a memory was used, so eviction favours useful entries. */
  const markUsed = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const current = await memoryStore.list();
    const now = Date.now();
    const updated = current.map((item) =>
      ids.includes(item.id) ? { ...item, useCount: item.useCount + 1, lastUsedAt: now } : item
    );
    await memoryStore.putMany(updated);
    setItems(updated);
  }, []);

  /* --- Conversation integration --- */

  /**
   * Runs before the request is sent: handles explicit commands in the user's
   * message ("remember that…", "forget…") and conservative auto-capture.
   */
  const processUserMessage = useCallback(
    async (message: string, conversationId?: string): Promise<MemoryWriteOutcome> => {
      if (!settings.enabled) return EMPTY_OUTCOME;

      const outcome: MemoryWriteOutcome = { ...EMPTY_OUTCOME, saved: [], rejected: [], removed: [] };
      const { directives, wantsRecall } = parseMemoryCommands(message);
      outcome.recallRequested = wantsRecall;

      const suppress = directives.some((d) => d.kind === 'do_not_remember');

      for (const directive of directives) {
        if (directive.kind === 'forget_all') {
          const before = await memoryStore.list();
          await memoryStore.clear();
          setItems([]);
          outcome.clearedAll = true;
          outcome.removed.push(...before);
          continue;
        }

        if (directive.kind === 'forget') {
          const current = await memoryStore.list();
          const needle = directive.query.toLowerCase();
          const matches = current.filter(
            (item) =>
              item.content.toLowerCase().includes(needle) ||
              item.keywords.some((k) => needle.includes(k))
          );
          for (const match of matches) await memoryStore.remove(match.id);
          if (matches.length > 0) {
            setItems(await memoryStore.list());
            outcome.removed.push(...matches);
          }
          continue;
        }

        if (directive.kind === 'remember' && !suppress) {
          const result = await addMemory(directive.content, {
            source: 'explicit',
            importance: 4,
            conversationId,
          });
          if (result.ok) outcome.saved.push(result.item);
          else outcome.rejected.push({ content: directive.content, reason: result.reason });
        }
      }

      const alreadySaved = outcome.saved.length > 0;
      if (settings.autoCapture && !suppress && !alreadySaved) {
        for (const candidate of findAutoCaptureCandidates(message)) {
          const result = await addMemory(candidate.content, {
            source: 'auto',
            importance: candidate.importance,
            conversationId,
          });
          if (result.ok) outcome.saved.push(result.item);
        }
      }

      return outcome;
    },
    [settings.enabled, settings.autoCapture, addMemory]
  );

  /** Runs after a response completes: stores anything the model tagged. */
  const processAssistantMessage = useCallback(
    async (text: string, conversationId?: string): Promise<MemoryWriteOutcome> => {
      if (!settings.enabled) return EMPTY_OUTCOME;
      const { tags } = parseMemoryTags(text);
      if (tags.length === 0) return EMPTY_OUTCOME;

      const outcome: MemoryWriteOutcome = { ...EMPTY_OUTCOME, saved: [], rejected: [], removed: [] };
      for (const tag of tags) {
        const result = await addMemory(tag.content, {
          source: 'auto',
          category: tag.category,
          importance: tag.importance,
          conversationId,
        });
        if (result.ok) outcome.saved.push(result.item);
        else outcome.rejected.push({ content: tag.content, reason: result.reason });
      }
      return outcome;
    },
    [settings.enabled, addMemory]
  );

  const stats = useMemo(() => {
    const enabled = items.filter((i) => i.enabled).length;
    const byCategory = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1;
      return acc;
    }, {});
    return { total: items.length, enabled, disabled: items.length - enabled, byCategory };
  }, [items]);

  return {
    items,
    isLoaded,
    stats,
    addMemory,
    updateMemory,
    toggleMemory,
    deleteMemory,
    clearMemory,
    markUsed,
    persist,
    processUserMessage,
    processAssistantMessage,
  };
}

export type UseMemoryReturn = ReturnType<typeof useMemory>;

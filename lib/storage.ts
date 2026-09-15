import { Conversation, UserSettings } from '@/types/chat';
import { DEFAULT_MODEL_ID } from '@/lib/models';

const STORAGE_KEYS = {
  CONVERSATIONS: 'raizel_ai_conversations',
  ACTIVE_ID: 'raizel_ai_active_conv_id',
  SETTINGS: 'raizel_ai_settings',
  ARTIFACTS: 'raizel_ai_artifacts',
};

import { ArtifactProject } from '@/types/artifact';

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  enterToSend: true,
  showTimestamps: true,
  saveHistory: true,
  defaultModel: DEFAULT_MODEL_ID,
};

function isClient(): boolean {
  return typeof window !== 'undefined';
}

export function loadConversations(): Conversation[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse conversations from localStorage', e);
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(
      STORAGE_KEYS.CONVERSATIONS,
      JSON.stringify(conversations)
    );
  } catch (e) {
    console.error('Failed to save conversations to localStorage', e);
  }
}

export function loadActiveConversationId(): string | null {
  if (!isClient()) return null;
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
}

export function saveActiveConversationId(id: string | null): void {
  if (!isClient()) return;
  if (id) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_ID);
  }
}

export function loadSettings(): UserSettings {
  if (!isClient()) return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings to localStorage', e);
  }
}

export function loadArtifacts(): Record<string, ArtifactProject> {
  if (!isClient()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ARTIFACTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (e) {
    console.warn('Failed to load artifacts from localStorage', e);
    return {};
  }
}

export function saveArtifacts(artifactsMap: Record<string, ArtifactProject>): void {
  if (!isClient()) return;
  try {
    const serialized = JSON.stringify(artifactsMap);
    // If serialized string > 2.5MB, keep only the 5 most recent artifacts to avoid QuotaExceededError
    if (serialized.length > 2.5 * 1024 * 1024) {
      const entries = Object.entries(artifactsMap).sort(
        (a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)
      );
      const pruned: Record<string, ArtifactProject> = {};
      for (const [key, val] of entries.slice(0, 5)) {
        pruned[key] = val;
      }
      localStorage.setItem(STORAGE_KEYS.ARTIFACTS, JSON.stringify(pruned));
    } else {
      localStorage.setItem(STORAGE_KEYS.ARTIFACTS, serialized);
    }
  } catch (e) {
    console.warn('Unable to persist artifacts to localStorage (quota or disabled)', e);
  }
}

export function loadArtifactForConversation(conversationId: string): ArtifactProject | null {
  const map = loadArtifacts();
  return map[conversationId] || null;
}

export function saveArtifactForConversation(
  conversationId: string,
  artifact: ArtifactProject | null
): void {
  const map = loadArtifacts();
  if (artifact) {
    map[conversationId] = artifact;
  } else {
    delete map[conversationId];
  }
  saveArtifacts(map);
}

export function generateTitleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/[#*`_~]/g, '').trim();
  const firstLine = cleaned.split('\n')[0].trim();
  if (firstLine.length <= 36) return firstLine || 'New Chat';
  return `${firstLine.slice(0, 36).trim()}...`;
}


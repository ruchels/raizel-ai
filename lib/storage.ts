import { Conversation, UserSettings } from '@/types/chat';
import { DEFAULT_MODEL_ID } from '@/lib/models';

const STORAGE_KEYS = {
  CONVERSATIONS: 'raizel_ai_conversations',
  ACTIVE_ID: 'raizel_ai_active_conv_id',
  SETTINGS: 'raizel_ai_settings',
};

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

export function generateTitleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/[#*`_~]/g, '').trim();
  const firstLine = cleaned.split('\n')[0].trim();
  if (firstLine.length <= 36) return firstLine || 'New Chat';
  return `${firstLine.slice(0, 36).trim()}...`;
}

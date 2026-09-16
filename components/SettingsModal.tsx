'use client';

import React, { useMemo, useState } from 'react';
import {
  Brain,
  Monitor,
  Moon,
  Search,
  Shield,
  Sun,
  Trash2,
  MessageSquare,
  Cpu,
  Info,
  Plus,
} from 'lucide-react';
import type { ThemePreference, UserSettings } from '@/types/chat';
import type { MemoryCategory, MemoryItem } from '@/types/memory';
import { MEMORY_CATEGORY_LABELS } from '@/types/memory';
import { AVAILABLE_MODELS } from '@/lib/models';
import type { UseMemoryReturn } from '@/hooks/useMemory';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Modal,
  SectionLabel,
  SettingRow,
  Toggle,
  cx,
} from './ui/primitives';

export type SettingsSection = 'appearance' | 'models' | 'memory' | 'chat' | 'privacy' | 'about';

interface SettingsModalProps {
  open: boolean;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  memory: UseMemoryReturn;
  onClearAllChats: () => void;
  conversationCount: number;
}

const NAV: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
  { id: 'appearance', label: 'Appearance', icon: <Sun className="h-4 w-4" /> },
  { id: 'models', label: 'Models', icon: <Cpu className="h-4 w-4" /> },
  { id: 'memory', label: 'Memory', icon: <Brain className="h-4 w-4" /> },
  { id: 'chat', label: 'Chat', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'privacy', label: 'Privacy', icon: <Shield className="h-4 w-4" /> },
  { id: 'about', label: 'About', icon: <Info className="h-4 w-4" /> },
];

const THEMES: Array<{ id: ThemePreference; label: string; icon: React.ReactNode }> = [
  { id: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
  { id: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
  { id: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" /> },
];

const CATEGORY_ORDER: MemoryCategory[] = [
  'instruction',
  'preference',
  'profile',
  'technical',
  'project',
  'workflow',
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  section,
  onSectionChange,
  onClose,
  settings,
  onChange,
  memory,
  onClearAllChats,
  conversationCount,
}) => {
  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const setMemory = <K extends keyof UserSettings['memory']>(
    key: K,
    value: UserSettings['memory'][K]
  ) => onChange({ ...settings, memory: { ...settings.memory, [key]: value } });

  return (
    <Modal open={open} onClose={onClose} title="Settings" size="lg">
      <div className="flex min-h-[26rem] flex-col sm:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] p-2 sm:w-44 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={cx(
                'flex shrink-0 items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-[13px] transition-colors',
                section === item.id
                  ? 'bg-[var(--fill-active)] text-[var(--text)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--fill)]'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 p-5">
          {section === 'appearance' && (
            <div>
              <SectionLabel>Theme</SectionLabel>
              <div className="inline-flex rounded-[var(--radius)] border border-[var(--border)] p-0.5">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => set('theme', theme.id)}
                    className={cx(
                      'flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] transition-colors',
                      settings.theme === theme.id
                        ? 'bg-[var(--fill-active)] text-[var(--text)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                    )}
                  >
                    {theme.icon}
                    {theme.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">
                System follows your operating system setting and updates live.
              </p>
            </div>
          )}

          {section === 'models' && (
            <div>
              <SectionLabel>Default model</SectionLabel>
              <select
                value={settings.defaultModel}
                onChange={(event) => set('defaultModel', event.target.value)}
                className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
              >
                {AVAILABLE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} — {model.provider}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">
                Used for new chats. Existing chats keep the model they were started with.
              </p>

              <div className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
                <SettingRow
                  title="Let the model request files"
                  description="When the answer needs a file that was not sent, RAIZEL fetches it from the local index and continues. Costs one extra round trip."
                >
                  <Toggle
                    checked={settings.allowFileRequests}
                    onChange={(next) => set('allowFileRequests', next)}
                    label="Allow file requests"
                  />
                </SettingRow>
              </div>
            </div>
          )}

          {section === 'memory' && (
            <MemorySection
              settings={settings}
              setMemory={setMemory}
              memory={memory}
            />
          )}

          {section === 'chat' && (
            <div className="divide-y divide-[var(--border)]">
              <SettingRow
                title="Enter to send"
                description="Off means Enter adds a new line and Ctrl/⌘ + Enter sends."
              >
                <Toggle
                  checked={settings.enterToSend}
                  onChange={(next) => set('enterToSend', next)}
                  label="Enter to send"
                />
              </SettingRow>
              <SettingRow title="Show timestamps" description="Display the time on each response.">
                <Toggle
                  checked={settings.showTimestamps}
                  onChange={(next) => set('showTimestamps', next)}
                  label="Show timestamps"
                />
              </SettingRow>
              <SettingRow
                title="Open the workspace automatically"
                description="Reveal the side panel as soon as a response starts writing files."
              >
                <Toggle
                  checked={settings.autoOpenWorkspace}
                  onChange={(next) => set('autoOpenWorkspace', next)}
                  label="Auto-open workspace"
                />
              </SettingRow>
            </div>
          )}

          {section === 'privacy' && (
            <div>
              <div className="divide-y divide-[var(--border)]">
                <SettingRow
                  title="Save chat history"
                  description="Conversations are stored in this browser only. Turning this off stops new chats from being written to disk."
                >
                  <Toggle
                    checked={settings.saveHistory}
                    onChange={(next) => set('saveHistory', next)}
                    label="Save chat history"
                  />
                </SettingRow>
              </div>

              <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5">
                <p className="text-[13px] font-medium text-[var(--text)]">Where your data lives</p>
                <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                  <li>
                    Chats, projects, and memory are kept in this browser&apos;s local storage. They are
                    never uploaded to RAIZEL.
                  </li>
                  <li>
                    Message content is sent to the model provider through the server route so the API
                    key stays on the server and never reaches the browser.
                  </li>
                  <li>
                    Credentials detected in files are redacted before a project is exported and are
                    refused outright by memory.
                  </li>
                </ul>
              </div>

              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <SectionLabel>Danger zone</SectionLabel>
                <ConfirmButton
                  label={`Delete all ${conversationCount} conversations`}
                  confirmLabel="Delete everything — this cannot be undone"
                  onConfirm={onClearAllChats}
                  disabled={conversationCount === 0}
                />
              </div>
            </div>
          )}

          {section === 'about' && (
            <div className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
              <p className="text-[15px] font-semibold text-[var(--text)]">RAIZEL</p>
              <p className="mt-2">
                An assistant with a project workspace, a real file index, and long-term memory.
                Uploaded projects are decoded file by file and indexed; the model is given the
                manifest plus the files that are relevant to what you asked, and can request more.
              </p>
              <dl className="mt-4 space-y-2">
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-[var(--text-muted)]">Gateway</dt>
                  <dd>Rindri, proxied server-side</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-[var(--text-muted)]">Models</dt>
                  <dd>{AVAILABLE_MODELS.length} available</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-[var(--text-muted)]">Storage</dt>
                  <dd>Local to this browser</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Memory section                                                      */
/* ------------------------------------------------------------------ */

interface MemorySectionProps {
  settings: UserSettings;
  setMemory: <K extends keyof UserSettings['memory']>(key: K, value: UserSettings['memory'][K]) => void;
  memory: UseMemoryReturn;
}

const MemorySection: React.FC<MemorySectionProps> = ({ settings, setMemory, memory }) => {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const items = needle
      ? memory.items.filter(
          (item) =>
            item.content.toLowerCase().includes(needle) ||
            item.keywords.some((k) => k.includes(needle)) ||
            item.category.includes(needle)
        )
      : memory.items;

    return [...items].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category);
      const bi = CATEGORY_ORDER.indexOf(b.category);
      if (ai !== bi) return ai - bi;
      return b.updatedAt - a.updatedAt;
    });
  }, [memory.items, query]);

  const addDraft = async () => {
    setError(null);
    const result = await memory.addMemory(draft, { source: 'manual' });
    if (result.ok) {
      setDraft('');
      setIsAdding(false);
    } else {
      setError(`Not saved — ${result.reason}.`);
    }
  };

  return (
    <div>
      <div className="divide-y divide-[var(--border)]">
        <SettingRow
          title="Memory"
          description="When off, nothing is saved and nothing is recalled. Stored items are kept, not deleted."
        >
          <Toggle
            checked={settings.memory.enabled}
            onChange={(next) => setMemory('enabled', next)}
            label="Enable memory"
          />
        </SettingRow>
        <SettingRow
          title="Save automatically"
          description="Capture durable preferences as you mention them. With this off, only explicit “remember …” requests are stored."
        >
          <Toggle
            checked={settings.memory.autoCapture}
            onChange={(next) => setMemory('autoCapture', next)}
            label="Auto-save memory"
            disabled={!settings.memory.enabled}
          />
        </SettingRow>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SectionLabel>
            Stored
            <span className="ml-1.5 font-normal normal-case tracking-normal">
              {memory.stats.total}
              {memory.stats.disabled > 0 && ` · ${memory.stats.disabled} off`}
            </span>
          </SectionLabel>
        </div>
        <Button size="sm" onClick={() => setIsAdding((prev) => !prev)}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {isAdding && (
        <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5">
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Prefers TypeScript over JavaScript"
            className="w-full resize-none bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {error && <p className="mb-2 text-[12px] text-[var(--danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={addDraft} disabled={draft.trim().length < 3}>
              Save
            </Button>
          </div>
        </div>
      )}

      {memory.items.length > 3 && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memory"
            className="h-8 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] pl-8 pr-2.5 text-[13px] outline-none focus:border-[var(--border-strong)]"
          />
        </div>
      )}

      <div className="max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)]">
        {!memory.isLoaded ? (
          <p className="p-6 text-center text-[13px] text-[var(--text-muted)]">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Brain className="h-6 w-6" />}
            title={memory.items.length === 0 ? 'Nothing remembered yet' : 'No matches'}
            description={
              memory.items.length === 0
                ? 'Tell RAIZEL “remember that I prefer TypeScript” and it will show up here.'
                : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {filtered.map((item) => (
              <MemoryRow
                key={item.id}
                item={item}
                onToggle={() => memory.toggleMemory(item.id)}
                onDelete={() => memory.deleteMemory(item.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {memory.items.length > 0 && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <ConfirmButton
            label={`Clear all ${memory.items.length} memories`}
            confirmLabel="Clear memory — this cannot be undone"
            onConfirm={() => void memory.clearMemory()}
          />
        </div>
      )}
    </div>
  );
};

const MemoryRow: React.FC<{
  item: MemoryItem;
  onToggle: () => void;
  onDelete: () => void;
}> = ({ item, onToggle, onDelete }) => (
  <li className={cx('group flex items-start gap-3 px-3 py-2.5', !item.enabled && 'opacity-55')}>
    <div className="min-w-0 flex-1">
      <p className="text-[13px] leading-snug text-[var(--text)]">{item.content}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={item.category === 'instruction' ? 'accent' : 'neutral'}>
          {MEMORY_CATEGORY_LABELS[item.category]}
        </Badge>
        <span className="text-[11px] text-[var(--text-muted)]">
          {item.source === 'explicit' ? 'you asked' : item.source === 'auto' ? 'auto-saved' : 'added manually'}
          {item.useCount > 0 && ` · used ${item.useCount}×`}
        </span>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      <Toggle checked={item.enabled} onChange={onToggle} label={`Toggle: ${item.content}`} />
      <IconButton label={`Delete: ${item.content}`} size="sm" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  </li>
);

/* ------------------------------------------------------------------ */
/* Destructive action with inline confirmation                         */
/* ------------------------------------------------------------------ */

const ConfirmButton: React.FC<{
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}> = ({ label, confirmLabel, onConfirm, disabled }) => {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button variant="danger" size="sm" disabled={disabled} onClick={() => setArmed(true)}>
        <Trash2 className="h-3.5 w-3.5" />
        {label}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="danger"
        size="sm"
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </div>
  );
};

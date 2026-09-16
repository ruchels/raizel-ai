'use client';

import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Settings,
  Info,
  Trash2,
  Pencil,
  Check,
  X,
  PanelLeft,
  Brain,
} from 'lucide-react';
import type { Conversation } from '@/types/chat';
import { Button, EmptyState, IconButton, cx } from './ui/primitives';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  memoryCount: number;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenSettings: (section?: 'memory') => void;
  onOpenAbout: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

interface Group {
  label: string;
  items: Conversation[];
}

function groupByRecency(conversations: Conversation[]): Group[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;

  const groups: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    'Previous 30 days': [],
    Older: [],
  };

  for (const conversation of conversations) {
    const at = conversation.updatedAt || conversation.createdAt;
    if (at >= startOfToday) groups.Today.push(conversation);
    else if (at >= startOfToday - day) groups.Yesterday.push(conversation);
    else if (at >= startOfToday - 7 * day) groups['Previous 7 days'].push(conversation);
    else if (at >= startOfToday - 30 * day) groups['Previous 30 days'].push(conversation);
    else groups.Older.push(conversation);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  memoryCount,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  onOpenSettings,
  onOpenAbout,
  isMobileOpen,
  onCloseMobile,
}) => {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) => {
      if (conversation.title.toLowerCase().includes(needle)) return true;
      // Searching message text makes history useful once it is long.
      return conversation.messages.some((m) => m.content.toLowerCase().includes(needle));
    });
  }, [conversations, query]);

  const groups = useMemo(() => groupByRecency(filtered), [filtered]);

  const commitRename = (id: string) => {
    const next = draftTitle.trim();
    if (next) onRename(id, next);
    setEditingId(null);
  };

  const content = (
    <div className="flex h-full flex-col bg-[var(--bg-subtle)] border-r border-[var(--border)]">
      <div className="flex items-center justify-between gap-2 px-3 h-14 shrink-0">
        <span className="text-[13px] font-semibold tracking-[0.14em] text-[var(--text)] uppercase pl-1">
          Raizel
        </span>
        <IconButton label="Close menu" onClick={onCloseMobile} className="md:hidden" size="sm">
          <PanelLeft className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="px-3 pb-2 shrink-0">
        <Button variant="secondary" size="md" className="w-full justify-start" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {conversations.length > 0 && (
        <div className="px-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              className="h-8 w-full rounded-[var(--radius)] border border-transparent bg-[var(--fill)] pl-8 pr-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-strong)] focus:bg-[var(--bg)]"
            />
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <EmptyState title="No chats yet" description="Your conversations will appear here." />
        ) : filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-[var(--text-muted)]">
            Nothing matches that search.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-3">
              <h4 className="px-2 pb-1 pt-2 text-[11px] font-medium text-[var(--text-muted)]">
                {group.label}
              </h4>
              <ul>
                {group.items.map((conversation) => {
                  const isActive = conversation.id === activeId;
                  const isEditing = editingId === conversation.id;
                  const isConfirmingDelete = pendingDelete === conversation.id;

                  if (isEditing) {
                    return (
                      <li key={conversation.id} className="px-1 py-0.5">
                        <div className="flex items-center gap-1 rounded-[var(--radius)] bg-[var(--bg)] px-1.5 py-1 ring-1 ring-[var(--accent)]">
                          <input
                            autoFocus
                            value={draftTitle}
                            onChange={(event) => setDraftTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') commitRename(conversation.id);
                              if (event.key === 'Escape') setEditingId(null);
                            }}
                            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none"
                          />
                          <IconButton
                            label="Save name"
                            size="sm"
                            onClick={() => commitRename(conversation.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label="Cancel" size="sm" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li key={conversation.id} className="px-1 py-0.5">
                      <div
                        className={cx(
                          'group flex items-center gap-1 rounded-[var(--radius)] pl-2.5 pr-1',
                          isActive ? 'bg-[var(--fill-active)]' : 'hover:bg-[var(--fill)]'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(conversation.id);
                            onCloseMobile();
                          }}
                          className="min-w-0 flex-1 truncate py-2 text-left text-[13px] text-[var(--text)]"
                        >
                          {conversation.title}
                        </button>

                        {isConfirmingDelete ? (
                          <span className="flex items-center gap-0.5">
                            <IconButton
                              label="Confirm delete"
                              size="sm"
                              className="text-[var(--danger)]"
                              onClick={() => {
                                onDelete(conversation.id);
                                setPendingDelete(null);
                              }}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton
                              label="Cancel delete"
                              size="sm"
                              onClick={() => setPendingDelete(null)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </IconButton>
                          </span>
                        ) : (
                          <span
                            className={cx(
                              'flex items-center gap-0.5 transition-opacity',
                              isActive
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                            )}
                          >
                            <IconButton
                              label="Rename chat"
                              size="sm"
                              onClick={() => {
                                setEditingId(conversation.id);
                                setDraftTitle(conversation.title);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton
                              label="Delete chat"
                              size="sm"
                              onClick={() => setPendingDelete(conversation.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </nav>

      <div className="shrink-0 border-t border-[var(--border)] p-2">
        <button
          type="button"
          onClick={() => onOpenSettings('memory')}
          className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--fill)] hover:text-[var(--text)]"
        >
          <Brain className="h-4 w-4" />
          <span className="flex-1 text-left">Memory</span>
          <span className="tabular text-[12px] text-[var(--text-muted)]">{memoryCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenSettings()}
          className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--fill)] hover:text-[var(--text)]"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
        <button
          type="button"
          onClick={onOpenAbout}
          className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--fill)] hover:text-[var(--text)]"
        >
          <Info className="h-4 w-4" />
          About
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block w-[260px] shrink-0 h-full">{content}</aside>

      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-[var(--bg-overlay)] animate-fade-in" onClick={onCloseMobile} />
          <div className="relative z-10 h-full w-[84%] max-w-[300px] shadow-[var(--shadow-lg)] animate-slide-up">
            {content}
          </div>
        </div>
      )}
    </>
  );
};

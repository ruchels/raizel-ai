'use client';

import React, { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  Settings,
  Info,
  Sparkles,
  PanelLeftClose,
} from 'lucide-react';
import { Conversation } from '@/types/chat';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onOpenSettings,
  onOpenAbout,
  isOpenMobile,
  onCloseMobile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleSaveRename = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingTitle.trim()) {
      onRenameConversation(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelRename = () => {
    setEditingId(null);
  };

  // Filter conversations by search
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group conversations: Today, Yesterday, Previous 7 Days, Older
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOf7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const todayList: Conversation[] = [];
  const yesterdayList: Conversation[] = [];
  const past7DaysList: Conversation[] = [];
  const olderList: Conversation[] = [];

  filteredConversations.forEach((conv) => {
    const timestamp = conv.updatedAt || conv.createdAt;
    if (timestamp >= startOfToday) {
      todayList.push(conv);
    } else if (timestamp >= startOfYesterday) {
      yesterdayList.push(conv);
    } else if (timestamp >= startOf7Days) {
      past7DaysList.push(conv);
    } else {
      olderList.push(conv);
    }
  });

  const renderGroup = (title: string, list: Conversation[]) => {
    if (list.length === 0) return null;

    return (
      <div className="mb-4">
        <h4 className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          {title}
        </h4>
        <div className="space-y-1">
          {list.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = conv.id === editingId;

            return (
              <div
                key={conv.id}
                onClick={() => {
                  if (!isEditing) {
                    onSelectConversation(conv.id);
                    onCloseMobile();
                  }
                }}
                className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600/20 text-white border border-indigo-500/30'
                    : 'text-slate-300 hover:bg-white/[0.04] hover:text-white border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                  <MessageSquare
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-400'
                    }`}
                  />
                  {isEditing ? (
                    <form
                      onSubmit={(e) => handleSaveRename(conv.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 flex items-center gap-1 min-w-0"
                    >
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        autoFocus
                        className="w-full bg-black/50 px-2 py-0.5 rounded text-xs text-white border border-indigo-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelRename}
                        className="p-1 text-slate-400 hover:text-slate-300 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <span className="truncate text-xs sm:text-sm">{conv.title}</span>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => startRename(conv, e)}
                      className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 cursor-pointer"
                      title="Rename chat"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-rose-400 cursor-pointer"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0a0c13] border-r border-white/[0.08] text-slate-200 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-wider text-white">
              RAIZEL <span className="text-indigo-400">AI</span>
            </h1>
            <p className="text-[10px] text-slate-400 leading-tight">
              Your AI. Your Ideas.
            </p>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          type="button"
          onClick={onCloseMobile}
          className="md:hidden p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md shadow-indigo-600/25 transition-all duration-150 cursor-pointer group"
        >
          <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Search Bar */}
      {conversations.length > 0 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.06] border border-white/[0.06] rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/40 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-500 text-xs">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No conversations yet.</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Start typing below to begin.
            </p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            No chats matching &quot;{searchQuery}&quot;
          </div>
        ) : (
          <>
            {renderGroup('Today', todayList)}
            {renderGroup('Yesterday', yesterdayList)}
            {renderGroup('Previous 7 Days', past7DaysList)}
            {renderGroup('Older', olderList)}
          </>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-white/[0.06] space-y-1 bg-[#090b10]">
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Settings</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onOpenAbout();
            onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
        >
          <Info className="w-4 h-4 text-slate-400" />
          <span>About RAIZEL AI</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Permanent) */}
      <aside className="hidden md:block w-64 lg:w-72 h-screen shrink-0 sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Overlay) */}
      {isOpenMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-4/5 max-w-xs h-full z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

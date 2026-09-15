'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Sparkles,
  Settings as SettingsIcon,
  PlusCircle,
  Loader2,
} from 'lucide-react';
import {
  ChatMessage as ChatMessageType,
  Conversation,
  UserSettings,
  FileAttachment,
} from '@/types/chat';
import { DEFAULT_MODEL_ID, getModelInfo } from '@/lib/models';
import {
  loadConversations,
  saveConversations,
  loadActiveConversationId,
  saveActiveConversationId,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  generateTitleFromPrompt,
} from '@/lib/storage';
import { Sidebar } from '@/components/Sidebar';
import { ModelSelector } from '@/components/ModelSelector';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { SettingsModal } from '@/components/SettingsModal';
import { AboutModal } from '@/components/AboutModal';

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize data from localStorage on client load
  useEffect(() => {
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);
    setSelectedModel(loadedSettings.defaultModel || DEFAULT_MODEL_ID);

    const savedConvs = loadConversations();
    setConversations(savedConvs);

    const savedActiveId = loadActiveConversationId();
    if (savedActiveId && savedConvs.some((c) => c.id === savedActiveId)) {
      setActiveId(savedActiveId);
      const activeConv = savedConvs.find((c) => c.id === savedActiveId);
      if (activeConv) {
        setSelectedModel(activeConv.model || loadedSettings.defaultModel);
      }
    }
  }, []);

  // Save conversations to localStorage whenever they change
  useEffect(() => {
    if (settings.saveHistory) {
      saveConversations(conversations);
    }
  }, [conversations, settings.saveHistory]);

  // Save active conversation id
  useEffect(() => {
    saveActiveConversationId(activeId);
  }, [activeId]);

  // Auto-scroll to bottom of chat
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [activeId]);

  useEffect(() => {
    scrollToBottom(true);
  }, [conversations, isThinking]);

  const activeConversation = conversations.find((c) => c.id === activeId);
  const currentMessages = activeConversation?.messages || [];

  // Create new chat
  const handleNewChat = () => {
    setActiveId(null);
    setInput('');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setIsThinking(false);
    }
  };

  // Select existing chat
  const handleSelectConversation = (id: string) => {
    setActiveId(id);
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setSelectedModel(conv.model);
    }
  };

  // Delete chat
  const handleDeleteConversation = (id: string) => {
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    if (activeId === id) {
      setActiveId(null);
    }
  };

  // Rename chat
  const handleRenameConversation = (id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
  };

  // Clear all chats
  const handleClearAllChats = () => {
    setConversations([]);
    setActiveId(null);
    localStorage.removeItem('raizel_ai_conversations');
    localStorage.removeItem('raizel_ai_active_conv_id');
  };

  // Model switch
  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    if (activeId) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, model: modelId } : c))
      );
    }
  };

  // Save Settings
  const handleSaveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // Send message
  const handleSendMessage = async (
    customPrompt?: string,
    attachmentsToSend: FileAttachment[] = []
  ) => {
    const promptToSend = (customPrompt || input).trim();
    if ((!promptToSend && attachmentsToSend.length === 0) || isLoading) return;

    setInput('');

    let convId = activeId;
    let targetConv = conversations.find((c) => c.id === convId);

    // If no conversation exists or starting fresh, create new conversation
    if (!convId || !targetConv) {
      convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const titleBase =
        promptToSend ||
        (attachmentsToSend[0] ? `Attached: ${attachmentsToSend[0].name}` : 'New Chat');
      const newConv: Conversation = {
        id: convId,
        title: generateTitleFromPrompt(titleBase),
        model: selectedModel,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      targetConv = newConv;
      setConversations((prev) => [newConv, ...prev]);
      setActiveId(convId);
    }

    const userMessage: ChatMessageType = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: promptToSend,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      createdAt: Date.now(),
    };

    const assistantMessageId = `msg_ast_${Date.now()}`;
    const assistantPlaceholder: ChatMessageType = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      model: selectedModel,
      createdAt: Date.now(),
    };

    const updatedMessages = [...targetConv.messages, userMessage];

    // Optimistically update conversation
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...updatedMessages, assistantPlaceholder],
              updatedAt: Date.now(),
            }
          : c
      )
    );

    setIsLoading(true);
    setIsThinking(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Build API request payload
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error ||
            'Something went wrong. RAIZEL AI couldn\'t connect to the AI provider.'
        );
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulatedText = '';
        let accumulatedReasoning = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === '[DONE]') {
                break;
              }
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.error) {
                  throw new Error(parsed.error);
                }

                const hasNewContent = Boolean(parsed.delta);
                const hasNewReasoning = Boolean(parsed.reasoning);

                if (hasNewContent || hasNewReasoning) {
                  setIsThinking(false);
                }

                if (hasNewReasoning) {
                  accumulatedReasoning += parsed.reasoning;
                }

                if (hasNewContent) {
                  accumulatedText += parsed.delta;
                }

                if (hasNewContent || hasNewReasoning) {
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id === convId
                        ? {
                            ...c,
                            messages: c.messages.map((m) =>
                              m.id === assistantMessageId
                                ? {
                                    ...m,
                                    content: accumulatedText,
                                    reasoning: accumulatedReasoning || undefined,
                                  }
                                : m
                            ),
                          }
                        : c
                    )
                  );
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && parseErr.message !== 'Unexpected token') {
                  throw parseErr;
                }
              }
            }
          }
        }

        // If the stream ended without any output tokens or reasoning
        if (!accumulatedText.trim() && !accumulatedReasoning.trim()) {
          throw new Error(
            'Model tidak memberikan respon atau koneksi terputus dari provider AI (Timeout/Overload). Silakan klik Try Again atau gunakan model yang lebih gesit seperti Claude Sonnet 5 atau DeepSeek V4 Pro.'
          );
        }
      } else {
        // Non-streaming response fallback
        const result = await response.json();
        setIsThinking(false);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: result.content }
                      : m
                  ),
                }
              : c
          )
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User voluntarily stopped generation
        return;
      }

      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Something went wrong. RAIZEL AI couldn\'t connect to the AI provider.';

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: errorMessage,
                        isError: true,
                      }
                    : m
                ),
              }
            : c
        )
      );
    } finally {
      setIsLoading(false);
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  };

  // Stop response generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setIsThinking(false);
    }
  };

  // Retry last prompt
  const handleRetry = () => {
    if (!activeConversation) return;
    const messages = activeConversation.messages;
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      // Remove failed assistant message
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                messages: c.messages.filter((m) => !m.isError),
              }
            : c
        )
      );
      handleSendMessage(lastUserMessage.content, lastUserMessage.attachments);
    }
  };

  const currentModelInfo = getModelInfo(selectedModel);
  const thinkingLabel = `${currentModelInfo?.name || 'RAIZEL AI'} is thinking...`;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#08090d] text-slate-100 antialiased font-sans">
      {/* Sidebar (Desktop & Mobile Drawer) */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Navbar */}
        <header className="h-14 sm:h-16 shrink-0 border-b border-white/[0.06] bg-[#090b11]/80 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between z-20">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Open chat history menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Model Selector dropdown */}
            <ModelSelector
              currentModelId={selectedModel}
              onSelectModel={handleSelectModel}
              disabled={isLoading}
            />
          </div>

          {/* Right Header Action Icons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="New Chat"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Workspace Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat Feed Area */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-6 py-4 flex flex-col">
          {currentMessages.length === 0 ? (
            <WelcomeScreen onSelectPrompt={(prompt) => handleSendMessage(prompt)} />
          ) : (
            <div className="max-w-4xl mx-auto w-full space-y-4 pb-4">
              {currentMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onRetry={msg.isError ? handleRetry : undefined}
                />
              ))}

              {/* Dynamic Thinking State Indicator */}
              {isThinking && (
                <div className="w-full flex justify-start my-2 px-2 sm:px-0 animate-in fade-in duration-200">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-indigo-300 text-xs shadow-md">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                    </div>
                    <span className="font-medium flex items-center gap-1.5">
                      {thinkingLabel}
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" />
                        <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                      </span>
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} className="h-2" />
            </div>
          )}
        </div>

        {/* Bottom Floating Chat Input */}
        <footer className="shrink-0 z-20">
          <ChatInput
            input={input}
            setInput={setInput}
            onSubmit={(attachments) => handleSendMessage(undefined, attachments)}
            isLoading={isLoading}
            onStop={handleStopGeneration}
            enterToSend={settings.enterToSend}
          />
        </footer>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        onClearAllChats={handleClearAllChats}
      />

      {/* About Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}

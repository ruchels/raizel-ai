'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu, PanelRight, Plus } from 'lucide-react';
import type {
  ChatMessage as Message,
  Conversation,
  FileAttachment,
  MessageChange,
  UserSettings,
} from '@/types/chat';
import type { ArtifactProject, ProjectTemplate } from '@/types/artifact';
import { DEFAULT_MODEL_ID } from '@/lib/models';
import {
  DEFAULT_SETTINGS,
  CURRENT_SCHEMA_VERSION,
  clearConversationStorage,
  generateTitleFromPrompt,
  loadActiveConversationId,
  loadArtifacts,
  loadConversations,
  loadSettings,
  saveActiveConversationId,
  saveArtifactForConversation,
  saveConversations,
  saveSettings,
} from '@/lib/storage';
import {
  applyArtifactOperations,
  containsArtifactMarkup,
  extractStreamingFiles,
  parseArtifactFromResponse,
  stripArtifactMarkup,
} from '@/lib/artifact';
import { buildContext, formatAttachmentsForModel, indexFromProject } from '@/lib/context';
import { executeToolCalls, formatToolResults, parseToolCalls, stripToolCalls } from '@/lib/project/tools';
import { importProjectFromZip } from '@/lib/files';
import { useMemory } from '@/hooks/useMemory';
import { useIsMobile, useTheme } from '@/hooks/useTheme';
import { Sidebar } from '@/components/Sidebar';
import { ModelSelector } from '@/components/ModelSelector';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { SettingsModal, type SettingsSection } from '@/components/SettingsModal';
import { ArtifactWorkspace } from '@/components/artifact/ArtifactWorkspace';
import { IconButton, cx } from '@/components/ui/primitives';

/** How often the streaming text is flushed into React state. */
const STREAM_FLUSH_MS = 60;
/** Safety valve on the model-requests-files loop. */
const MAX_TOOL_ROUNDS = 2;

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  /* --- persisted state --- */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [artifacts, setArtifacts] = useState<Record<string, ArtifactProject>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isHydrated, setIsHydrated] = useState(false);

  /* --- session state --- */
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [filesWritten, setFilesWritten] = useState<number | null>(null);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);

  const isMobile = useIsMobile();
  useTheme(settings.theme);
  const memory = useMemory(settings.memory);

  /* --- refs mirroring state, so async handlers never read a stale closure --- */
  const conversationsRef = useRef(conversations);
  const artifactsRef = useRef(artifacts);
  const settingsRef = useRef(settings);
  const abortRef = useRef<AbortController | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottom = useRef(true);

  // Synced after commit, not during render: effects run before any event
  // handler can fire, so async work always reads the committed value.
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    artifactsRef.current = artifacts;
  }, [artifacts]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  /* ------------------------------------------------------------------ */
  /* Hydration                                                           */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);

    const loadedConversations = loadConversations();
    setConversations(loadedConversations);

    const loadedArtifacts = loadArtifacts();
    setArtifacts(loadedArtifacts);

    const storedActive = loadActiveConversationId();
    if (storedActive && loadedConversations.some((c) => c.id === storedActive)) {
      setActiveId(storedActive);
      if (loadedArtifacts[storedActive] && !window.matchMedia('(max-width: 767px)').matches) {
        setIsWorkspaceOpen(true);
      }
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated || !settings.saveHistory) return;
    saveConversations(conversations);
  }, [conversations, settings.saveHistory, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveActiveConversationId(activeId);
  }, [activeId, isHydrated]);

  /* ------------------------------------------------------------------ */
  /* Derived                                                             */
  /* ------------------------------------------------------------------ */

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );
  const messages = activeConversation?.messages ?? [];
  const activeProject = activeId ? (artifacts[activeId] ?? null) : null;
  const selectedModel = activeConversation?.model ?? settings.defaultModel ?? DEFAULT_MODEL_ID;

  /* --- autoscroll only while the user is already at the bottom --- */

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isPinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (isPinnedToBottom.current) {
      scrollAnchorRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages.length, streamingId]);

  useEffect(() => {
    isPinnedToBottom.current = true;
    scrollAnchorRef.current?.scrollIntoView({ block: 'end' });
  }, [activeId]);

  /* ------------------------------------------------------------------ */
  /* Mutation helpers                                                    */
  /* ------------------------------------------------------------------ */

  const patchMessage = useCallback(
    (conversationId: string, messageId: string, patch: Partial<Message>) => {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === messageId ? { ...message, ...patch } : message
                ),
              }
            : conversation
        )
      );
    },
    []
  );

  const commitProject = useCallback((conversationId: string, project: ArtifactProject) => {
    setArtifacts((prev) => ({ ...prev, [conversationId]: project }));
    artifactsRef.current = { ...artifactsRef.current, [conversationId]: project };
    saveArtifactForConversation(conversationId, project);
  }, []);

  const updateSettings = useCallback((next: UserSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Conversation actions                                                */
  /* ------------------------------------------------------------------ */

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setStreamingId(null);
    setStatusLine(null);
    setFilesWritten(null);
  }, []);

  const newChat = useCallback(() => {
    stopGeneration();
    setActiveId(null);
    setInput('');
    setIsWorkspaceOpen(false);
  }, [stopGeneration]);

  const selectConversation = useCallback(
    (id: string) => {
      stopGeneration();
      setActiveId(id);
      setIsWorkspaceOpen(Boolean(artifactsRef.current[id]) && !isMobile);
    },
    [stopGeneration, isMobile]
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setArtifacts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      saveArtifactForConversation(id, null);
      if (activeId === id) {
        setActiveId(null);
        setIsWorkspaceOpen(false);
      }
    },
    [activeId]
  );

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  const clearAllChats = useCallback(() => {
    stopGeneration();
    setConversations([]);
    setArtifacts({});
    setActiveId(null);
    setIsWorkspaceOpen(false);
    clearConversationStorage();
  }, [stopGeneration]);

  const selectModel = useCallback(
    (modelId: string) => {
      if (activeId) {
        setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, model: modelId } : c)));
      } else {
        updateSettings({ ...settingsRef.current, defaultModel: modelId });
      }
    },
    [activeId, updateSettings]
  );

  /* ------------------------------------------------------------------ */
  /* Workspace actions                                                   */
  /* ------------------------------------------------------------------ */

  const selectFile = useCallback(
    (path: string) => {
      if (!activeId) return;
      const project = artifactsRef.current[activeId];
      if (!project) return;
      commitProject(activeId, { ...project, activeFilePath: path });
      setIsWorkspaceOpen(true);
    },
    [activeId, commitProject]
  );

  const saveFileContent = useCallback(
    (path: string, content: string) => {
      if (!activeId) return;
      const project = artifactsRef.current[activeId];
      if (!project) return;

      commitProject(activeId, {
        ...project,
        files: project.files.map((file) =>
          file.path === path
            ? {
                ...file,
                content,
                previousContent: file.content !== content ? file.content : file.previousContent,
                isModified: true,
                editedByUser: true,
                updatedAt: Date.now(),
              }
            : file
        ),
        updatedAt: Date.now(),
        version: project.version + 1,
      });
    },
    [activeId, commitProject]
  );

  /* ------------------------------------------------------------------ */
  /* Sending                                                             */
  /* ------------------------------------------------------------------ */

  const sendMessage = useCallback(
    async (
      promptOverride?: string,
      attachments: FileAttachment[] = [],
      archives: Map<string, File> = new Map()
    ) => {
      const prompt = (promptOverride ?? input).trim();
      if ((!prompt && attachments.length === 0) || isLoading) return;

      if (!promptOverride) setInput('');

      const currentSettings = settingsRef.current;

      /* --- resolve or create the conversation --- */
      let conversationId = activeId;
      let conversation = conversationId
        ? (conversationsRef.current.find((c) => c.id === conversationId) ?? null)
        : null;

      if (!conversation) {
        conversationId = newId('conv');
        conversation = {
          id: conversationId,
          title: generateTitleFromPrompt(prompt || attachments[0]?.name || 'New chat'),
          model: currentSettings.defaultModel || DEFAULT_MODEL_ID,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          schemaVersion: CURRENT_SCHEMA_VERSION,
        };
        setConversations((prev) => [conversation as Conversation, ...prev]);
        conversationsRef.current = [conversation, ...conversationsRef.current];
        setActiveId(conversationId);
      }

      const convId = conversationId as string;
      const model = conversation.model;

      const zipAttachment = attachments.find(
        (a) => a.type === 'zip' && a.status !== 'failed' && archives.has(a.id)
      );

      const userMessage: Message = {
        id: newId('msg_u'),
        role: 'user',
        content: prompt,
        attachments: attachments.length > 0 ? attachments : undefined,
        createdAt: Date.now(),
      };

      const assistantId = newId('msg_a');
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        model,
        createdAt: Date.now(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: [...c.messages, userMessage, assistantMessage], updatedAt: Date.now() }
            : c
        )
      );

      setIsLoading(true);
      setStreamingId(assistantId);
      setFilesWritten(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        /* --- memory: explicit commands run before the request --- */
        const memoryOutcome = await memory.processUserMessage(prompt, convId);
        if (memoryOutcome.saved.length > 0) {
          patchMessage(convId, userMessage.id, {
            memoryWrites: memoryOutcome.saved.map((m) => ({ id: m.id, content: m.content })),
          });
        }

        /* --- ZIP import: every text file is decoded here, for real --- */
        let project = artifactsRef.current[convId] ?? null;

        if (zipAttachment) {
          const archive = archives.get(zipAttachment.id) as File;
          try {
            const imported = await importProjectFromZip(archive, convId, (progress) => {
              setStatusLine(
                `Reading ${archive.name} — ${progress.processed}/${progress.total} files`
              );
            });

            if (imported) {
              commitProject(convId, imported.project);
              project = imported.project;
              if (settingsRef.current.autoOpenWorkspace && !isMobile) setIsWorkspaceOpen(true);

              const readable = imported.index.manifest.readableCount;
              patchMessage(convId, userMessage.id, {
                attachments: attachments.map((a) =>
                  a.id === zipAttachment.id
                    ? {
                        ...a,
                        status: readable > 0 ? 'ready' : 'partial',
                        statusDetail: `Read ${readable} of ${imported.index.manifest.fileCount} files. ${imported.skipped.length} skipped.`,
                        fileCount: imported.index.manifest.fileCount,
                        readableCount: readable,
                      }
                    : a
                ),
              });
            } else {
              patchMessage(convId, userMessage.id, {
                attachments: attachments.map((a) =>
                  a.id === zipAttachment.id
                    ? { ...a, status: 'failed', statusDetail: 'The archive contained no importable files.' }
                    : a
                ),
              });
            }
          } catch (importError) {
            patchMessage(convId, userMessage.id, {
              attachments: attachments.map((a) =>
                a.id === zipAttachment.id
                  ? {
                      ...a,
                      status: 'failed',
                      statusDetail:
                        importError instanceof Error
                          ? `Import failed: ${importError.message}`
                          : 'The archive could not be imported.',
                    }
                  : a
              ),
            });
          }
        }

        setStatusLine(null);

        /* --- build context --- */
        const projectIndex = project ? indexFromProject(project) : null;

        const context = buildContext({
          project,
          index: projectIndex,
          userMessage: prompt,
          memories: memory.items,
          memoryLimit: currentSettings.memory.retrievalLimit,
          memoryEnabled: currentSettings.memory.enabled,
          allowFileRequests: currentSettings.allowFileRequests && Boolean(project),
        });

        if (context.usedMemories.length > 0) {
          void memory.markUsed(context.usedMemories.map((m) => m.item.id));
        }

        /* --- history: only the current turn carries attachment bodies --- */
        const history = (conversationsRef.current.find((c) => c.id === convId)?.messages ?? [])
          .filter((m) => m.id !== assistantId && !m.isError)
          .map((m) => {
            const isCurrentTurn = m.id === userMessage.id;
            const attachmentBlock =
              isCurrentTurn && m.attachments?.length
                ? formatAttachmentsForModel(m.attachments)
                : '';

            const base = isCurrentTurn
              ? m.content
              : stripToolCalls(stripArtifactMarkup(m.content)) || m.content;

            const summary =
              !isCurrentTurn && m.attachments?.length
                ? `\n[${m.attachments.length} attachment(s) from an earlier turn, not repeated here]`
                : '';

            return {
              role: m.role,
              content: [base, attachmentBlock, summary].filter(Boolean).join('\n\n'),
              attachments: isCurrentTurn ? m.attachments : undefined,
            };
          });

        /* --- stream, with an optional file-request round trip --- */
        let round = 0;
        let extraContext = '';
        const toolTrace: Array<{ tool: string; target: string; ok: boolean }> = [];
        let finalText = '';

        while (round <= MAX_TOOL_ROUNDS) {
          const text = await streamCompletion({
            model,
            messages:
              round === 0
                ? history
                : [...history, { role: 'assistant' as const, content: finalText }, { role: 'user' as const, content: extraContext }],
            systemContext: context.systemContext,
            signal: controller.signal,
            onDelta: (accumulated, reasoning) => {
              patchMessage(convId, assistantId, {
                content: accumulated,
                reasoning: reasoning || undefined,
              });
              if (
                settingsRef.current.autoOpenWorkspace &&
                !isMobile &&
                containsArtifactMarkup(accumulated)
              ) {
                setIsWorkspaceOpen(true);
              }
            },
            onFileProgress: setFilesWritten,
          });

          finalText = round === 0 ? text : `${finalText}\n\n${text}`;

          const toolCalls = currentSettings.allowFileRequests && project ? parseToolCalls(text) : [];
          if (toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) break;

          setStatusLine(`Reading ${toolCalls.length} file request(s)…`);
          const index = projectIndex ?? indexFromProject(project as ArtifactProject);
          const results = executeToolCalls(index, toolCalls);
          for (const result of results) {
            toolTrace.push({
              tool: result.call.tool,
              target: result.call.path ?? result.call.query ?? result.call.paths?.join(', ') ?? '',
              ok: result.ok,
            });
          }
          extraContext = formatToolResults(results);
          setStatusLine(null);
          round++;
        }

        /* --- apply workspace output --- */
        const parsed = parseArtifactFromResponse(finalText);
        let changes: MessageChange[] | undefined;
        let artifactSummary: Message['artifactSummary'];

        if (parsed.project && parsed.project.files.length > 0) {
          const existing = artifactsRef.current[convId];
          const next: ArtifactProject = {
            id: existing?.id ?? newId('art'),
            conversationId: convId,
            name: parsed.project.name,
            title: parsed.project.title,
            description: parsed.project.description,
            files: parsed.project.files,
            activeFilePath: parsed.project.files[0]?.path ?? '',
            createdAt: existing?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
            version: (existing?.version ?? 0) + 1,
            origin: 'generated',
            lastChanges: parsed.project.files.map((file) => ({
              operation: 'create_file' as const,
              path: file.path,
              status: 'applied' as const,
              addedLines: file.content.split('\n').length,
              removedLines: 0,
            })),
          };
          commitProject(convId, next);
          project = next;

          changes = next.lastChanges?.map((c) => ({
            operation: c.operation,
            path: c.path,
            newPath: c.newPath,
            addedLines: c.addedLines,
            removedLines: c.removedLines,
            reason: c.reason,
          }));
          artifactSummary = { name: next.name, title: next.title, fileCount: next.files.length };
          if (settingsRef.current.autoOpenWorkspace && !isMobile) setIsWorkspaceOpen(true);
        } else if (parsed.operations.length > 0) {
          const existing = artifactsRef.current[convId];
          if (existing) {
            const { project: updated, applied } = applyArtifactOperations(existing, parsed.operations);
            commitProject(convId, updated);
            project = updated;
            changes = applied.map((c) => ({
              operation: c.operation,
              path: c.path,
              newPath: c.newPath,
              addedLines: c.addedLines,
              removedLines: c.removedLines,
              reason: c.status === 'skipped' ? `skipped — ${c.skipReason}` : c.reason,
            }));
            artifactSummary = {
              name: updated.name,
              title: updated.title,
              fileCount: updated.files.length,
            };
            if (settingsRef.current.autoOpenWorkspace && !isMobile) setIsWorkspaceOpen(true);
          }
        }

        /* --- memory written by the model --- */
        const assistantMemory = await memory.processAssistantMessage(finalText, convId);

        patchMessage(convId, assistantId, {
          content: finalText,
          changes,
          artifactSummary,
          toolCalls: toolTrace.length > 0 ? toolTrace : undefined,
          memoryWrites:
            assistantMemory.saved.length > 0
              ? assistantMemory.saved.map((m) => ({ id: m.id, content: m.content }))
              : undefined,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // The user pressed stop: keep whatever streamed in.
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messages: c.messages.filter(
                      (m) => m.id !== assistantId || m.content.trim().length > 0
                    ),
                  }
                : c
            )
          );
        } else {
          patchMessage(convId, assistantId, {
            content:
              error instanceof Error
                ? error.message
                : 'Something went wrong talking to the model provider.',
            isError: true,
          });
        }
      } finally {
        abortRef.current = null;
        setIsLoading(false);
        setStreamingId(null);
        setStatusLine(null);
        setFilesWritten(null);
      }
    },
    [activeId, input, isLoading, isMobile, memory, patchMessage, commitProject]
  );

  /* --- ZIP import is driven from the input, which still holds the File --- */

  const handleSubmit = useCallback(
    (attachments: FileAttachment[], archives: Map<string, File>) => {
      void sendMessage(undefined, attachments, archives);
    },
    [sendMessage]
  );

  const retryLast = useCallback(() => {
    if (!activeConversation) return;
    const lastUser = [...activeConversation.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? { ...c, messages: c.messages.filter((m) => !m.isError) }
          : c
      )
    );
    void sendMessage(lastUser.content, lastUser.attachments ?? []);
  }, [activeConversation, sendMessage]);

  const loadTemplate = useCallback(
    (template: ProjectTemplate) => {
      const convId = newId('conv');
      const project: ArtifactProject = {
        id: newId('art'),
        conversationId: convId,
        name: template.project.name,
        title: template.project.title,
        description: template.project.description,
        files: template.project.files,
        activeFilePath: template.project.activeFilePath,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        origin: 'template',
      };

      const conversation: Conversation = {
        id: convId,
        title: template.name,
        model: settingsRef.current.defaultModel,
        messages: [
          {
            id: newId('msg_a'),
            role: 'assistant',
            content: `Loaded the **${template.name}** template into the workspace — ${template.project.files.length} files. Tell me what to change and I'll edit them in place.`,
            createdAt: Date.now(),
            artifactSummary: {
              name: project.name,
              title: project.title,
              fileCount: project.files.length,
            },
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };

      setConversations((prev) => [conversation, ...prev]);
      setActiveId(convId);
      commitProject(convId, project);
      if (!isMobile) setIsWorkspaceOpen(true);
    },
    [commitProject, isMobile]
  );

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[var(--bg)]">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        memoryCount={memory.stats.total}
        onSelect={selectConversation}
        onNewChat={newChat}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onOpenSettings={(section) => setSettingsSection(section ?? 'appearance')}
        onOpenAbout={() => setSettingsSection('about')}
        isMobileOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      <main className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-2 sm:px-3">
          <IconButton
            label="Open menu"
            className="md:hidden"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </IconButton>

          <ModelSelector value={selectedModel} onChange={selectModel} disabled={isLoading} />

          <div className="ml-auto flex items-center gap-1">
            {activeProject && (
              <button
                type="button"
                onClick={() => setIsWorkspaceOpen((prev) => !prev)}
                className={cx(
                  'inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] px-2.5 text-[13px] transition-colors',
                  isWorkspaceOpen
                    ? 'bg-[var(--fill-active)] text-[var(--text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--fill)]'
                )}
              >
                <PanelRight className="h-4 w-4" />
                <span className="hidden sm:inline">Workspace</span>
                <span className="tabular text-[11px] text-[var(--text-muted)]">
                  {activeProject.files.length}
                </span>
              </button>
            )}
            <IconButton label="New chat" onClick={newChat}>
              <Plus className="h-4 w-4" />
            </IconButton>
          </div>
        </header>

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          {messages.length === 0 ? (
            <WelcomeScreen
              onSelectPrompt={(prompt) => void sendMessage(prompt)}
              onSelectTemplate={loadTemplate}
            />
          ) : (
            <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-2">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  showTimestamp={settings.showTimestamps}
                  isStreaming={message.id === streamingId}
                  onRetry={message.isError ? retryLast : undefined}
                  onOpenWorkspace={() => setIsWorkspaceOpen(true)}
                  onOpenFile={selectFile}
                />
              ))}

              {isLoading && streamingId && !messages.find((m) => m.id === streamingId)?.content && (
                <div className="flex items-center gap-2 py-3 text-[13px] text-[var(--text-muted)]">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-dot" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-dot [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-dot [animation-delay:300ms]" />
                  </span>
                  {statusLine ?? 'Thinking'}
                </div>
              )}

              <div ref={scrollAnchorRef} />
            </div>
          )}
        </div>

        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          onStop={stopGeneration}
          enterToSend={settings.enterToSend}
        />
      </main>

      <ArtifactWorkspace
        project={activeProject}
        isOpen={isWorkspaceOpen && Boolean(activeProject)}
        isMobile={isMobile}
        isGenerating={isLoading}
        filesWritten={filesWritten}
        onClose={() => setIsWorkspaceOpen(false)}
        onSelectFile={selectFile}
        onSaveFile={saveFileContent}
        onAskAi={(prompt) => {
          if (isMobile) setIsWorkspaceOpen(false);
          void sendMessage(prompt);
        }}
      />

      <SettingsModal
        open={settingsSection !== null}
        section={settingsSection ?? 'appearance'}
        onSectionChange={setSettingsSection}
        onClose={() => setSettingsSection(null)}
        settings={settings}
        onChange={updateSettings}
        memory={memory}
        onClearAllChats={clearAllChats}
        conversationCount={conversations.length}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Streaming transport                                                 */
/* ------------------------------------------------------------------ */

interface StreamOptions {
  model: string;
  messages: Array<{ role: string; content: string; attachments?: FileAttachment[] }>;
  systemContext: string;
  signal: AbortSignal;
  onDelta: (accumulated: string, reasoning: string) => void;
  onFileProgress: (count: number | null) => void;
}

/**
 * Reads the SSE stream and accumulates text.
 *
 * UI updates are throttled and file extraction resumes from the last complete
 * `</file>` boundary, so a long generation stays O(n) rather than O(n²).
 */
async function streamCompletion(options: StreamOptions): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      systemContext: options.systemContext,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }

  if (!response.body) throw new Error('The server returned an empty response body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let text = '';
  let reasoning = '';
  let lastFlush = 0;
  let scannedTo = 0;
  let fileCount = 0;
  let done = false;

  const flush = (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlush < STREAM_FLUSH_MS) return;
    lastFlush = now;
    options.onDelta(text, reasoning);
  };

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        done = true;
        break;
      }

      let parsed: { delta?: string; reasoning?: string; error?: string };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (parsed.error) throw new Error(parsed.error);
      if (parsed.reasoning) reasoning += parsed.reasoning;
      if (parsed.delta) {
        text += parsed.delta;

        // Incremental: only scan the tail we have not parsed yet.
        const extracted = extractStreamingFiles(text, scannedTo);
        if (extracted.files.length > 0) {
          fileCount += extracted.files.length;
          scannedTo = extracted.scannedTo;
          options.onFileProgress(fileCount);
        }
      }
      flush();
    }
  }

  flush(true);
  return text;
}

'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import {
  Menu,
  Sparkles,
  Settings as SettingsIcon,
  PlusCircle,
  FolderArchive,
} from 'lucide-react';
import {
  ChatMessage as ChatMessageType,
  Conversation,
  UserSettings,
  FileAttachment,
} from '@/types/chat';
import {
  ArtifactProject,
  ProjectTemplate,
} from '@/types/artifact';
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
  loadArtifacts,
  saveArtifactForConversation,
} from '@/lib/storage';
import {
  parseArtifactFromResponse,
  applyArtifactOperations,
  detectCurrentGenerationStage,
  extractStreamingFiles,
} from '@/lib/artifact';
import { buildProjectContext } from '@/lib/context';
import { ProjectActionType } from '@/components/artifact/ArtifactHeader';
import { Sidebar } from '@/components/Sidebar';
import { ModelSelector } from '@/components/ModelSelector';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { SettingsModal } from '@/components/SettingsModal';
import { AboutModal } from '@/components/AboutModal';
import { ArtifactWorkspace } from '@/components/artifact/ArtifactWorkspace';

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

  // Artifact State & Real Generation Progress Tracking
  const [artifacts, setArtifacts] = useState<Record<string, ArtifactProject>>({});
  const [isArtifactOpen, setIsArtifactOpen] = useState<boolean>(false);
  const [generationStage, setGenerationStage] = useState<string>('Architecture & Plan');
  const [generationPercent, setGenerationPercent] = useState<number>(10);

  const [, startTransition] = useTransition();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize data from localStorage on client load
  useEffect(() => {
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);
    setSelectedModel(loadedSettings.defaultModel || DEFAULT_MODEL_ID);

    const savedConvs = loadConversations();
    setConversations(savedConvs);

    const savedArtifacts = loadArtifacts();
    setArtifacts(savedArtifacts);

    const savedActiveId = loadActiveConversationId();
    if (savedActiveId && savedConvs.some((c) => c.id === savedActiveId)) {
      setActiveId(savedActiveId);
      const activeConv = savedConvs.find((c) => c.id === savedActiveId);
      if (activeConv) {
        setSelectedModel(activeConv.model || loadedSettings.defaultModel);
      }
      // If active chat has an artifact, open workspace
      if (savedArtifacts[savedActiveId]) {
        setIsArtifactOpen(true);
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
  const activeArtifact = activeId ? artifacts[activeId] || null : null;

  // Create new chat
  const handleNewChat = () => {
    setActiveId(null);
    setInput('');
    setIsArtifactOpen(false);
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
    // Toggle artifact workspace if selected chat has an artifact
    if (artifacts[id]) {
      setIsArtifactOpen(true);
    } else {
      setIsArtifactOpen(false);
    }
  };

  // Delete chat
  const handleDeleteConversation = (id: string) => {
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    // Delete artifact mapping
    setArtifacts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    saveArtifactForConversation(id, null);

    if (activeId === id) {
      setActiveId(null);
      setIsArtifactOpen(false);
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
    setArtifacts({});
    setIsArtifactOpen(false);
    localStorage.removeItem('raizel_ai_conversations');
    localStorage.removeItem('raizel_ai_active_conv_id');
    localStorage.removeItem('raizel_ai_artifacts');
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

  // Select file in active artifact
  const handleSelectFile = (filePath: string) => {
    if (!activeId || !activeArtifact) return;
    const updatedProject: ArtifactProject = {
      ...activeArtifact,
      activeFilePath: filePath,
    };
    setArtifacts((prev) => ({ ...prev, [activeId]: updatedProject }));
    saveArtifactForConversation(activeId, updatedProject);
  };

  // Save manual file edit from code editor
  const handleSaveFileContent = (filePath: string, newContent: string) => {
    if (!activeId || !activeArtifact) return;
    const updatedFiles = activeArtifact.files.map((f) => {
      if (f.path === filePath) {
        return {
          ...f,
          content: newContent,
          previousContent: f.content !== newContent ? f.content : f.previousContent,
          isModified: true,
          updatedAt: Date.now(),
        };
      }
      return f;
    });

    const updatedProject: ArtifactProject = {
      ...activeArtifact,
      files: updatedFiles,
      updatedAt: Date.now(),
      version: activeArtifact.version + 1,
    };

    setArtifacts((prev) => ({ ...prev, [activeId]: updatedProject }));
    saveArtifactForConversation(activeId, updatedProject);
  };

  // Trigger project-level actions (Phase 12)
  const handleTriggerProjectAction = (action: ProjectActionType) => {
    if (!activeArtifact) return;
    switch (action) {
      case 'security':
        handleSendMessage('Perform a comprehensive defensive security review of this project. Inspect for OWASP Top 10 risks, insecure dependencies, secret exposure, and configuration issues. Provide detailed remediation advice and code fixes.');
        break;
      case 'review':
        handleSendMessage('Perform a thorough code and architecture review of this project. Evaluate code modularity, TypeScript type safety, error boundaries, performance, and maintainability.');
        break;
      case 'fix':
        handleSendMessage('Inspect the project for broken imports, syntax errors, and missing dependencies. Fix all identified issues and update the affected files using <raizel_operation>.');
        break;
      case 'explain':
        handleSendMessage('Explain the architecture, file structure, component relationships, and data flow of this project.');
        break;
      case 'test':
        handleSendMessage('Generate comprehensive unit and integration tests for the core modules and components in this project. Output tests using <raizel_operation>.');
        break;
    }
  };

  const handleAskAiToFix = (issuesPrompt: string) => {
    handleSendMessage(issuesPrompt);
  };

  // Launch Project Starter Template
  const handleSelectTemplate = (tmpl: ProjectTemplate) => {
    const newConvId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newProject: ArtifactProject = {
      id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversationId: newConvId,
      name: tmpl.project.name,
      title: tmpl.project.title,
      description: tmpl.project.description,
      files: tmpl.project.files,
      activeFilePath: tmpl.project.activeFilePath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };

    const userMessage: ChatMessageType = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: `Load template: ${tmpl.name}`,
      createdAt: Date.now(),
    };

    const assistantMessage: ChatMessageType = {
      id: `msg_ast_${Date.now()}`,
      role: 'assistant',
      content: `I've created and loaded the **${tmpl.name}** project into your workspace (${tmpl.project.files.length} files).\n\nYou can inspect the file tree on the right, make edits in the code editor, or click **Download ZIP** to export the entire project.`,
      model: selectedModel,
      createdAt: Date.now(),
      hasArtifact: true,
      artifactSummary: {
        name: tmpl.project.name,
        title: tmpl.project.title,
        fileCount: tmpl.project.files.length,
      },
    };

    const newConv: Conversation = {
      id: newConvId,
      title: tmpl.name,
      model: selectedModel,
      messages: [userMessage, assistantMessage],
      currentArtifactId: newProject.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConvId);
    setArtifacts((prev) => ({ ...prev, [newConvId]: newProject }));
    saveArtifactForConversation(newConvId, newProject);
    setIsArtifactOpen(true);
  };

  // Send message
  const handleSendMessage = async (
    customPrompt?: string,
    attachmentsToSend: FileAttachment[] = []
  ) => {
    let rawPrompt = (customPrompt || input).trim();
    if ((!rawPrompt && attachmentsToSend.length === 0) || isLoading) return;

    setInput('');

    // --- Slash Commands Parser ---
    if (rawPrompt.startsWith('/build')) {
      const task = rawPrompt.replace(/^\/build\s*/i, '').trim();
      rawPrompt = `Build project: ${task || 'portfolio website'}. Plan architecture and output all complete files using <raizel_artifact>.`;
    } else if (rawPrompt.startsWith('/security')) {
      const query = rawPrompt.replace(/^\/security\s*/i, '').trim();
      rawPrompt = `Defensive Security Review: Inspect the project for security vulnerabilities, OWASP Top 10 risks, and insecure configurations. Provide specific remediation: ${query}`;
    } else if (rawPrompt.startsWith('/review')) {
      rawPrompt = `Code & Architecture Review: Thoroughly evaluate structure, code cleanliness, performance, and maintainability of the project.`;
    } else if (rawPrompt.startsWith('/fix')) {
      const issue = rawPrompt.replace(/^\/fix\s*/i, '').trim();
      rawPrompt = `Fix issue in project: ${issue}. Update the affected files using <raizel_operation>.`;
    } else if (rawPrompt.startsWith('/explain')) {
      const topic = rawPrompt.replace(/^\/explain\s*/i, '').trim();
      rawPrompt = `Explain architecture and flow: ${topic || 'current project structure'}.`;
    } else if (rawPrompt.startsWith('/test')) {
      const target = rawPrompt.replace(/^\/test\s*/i, '').trim();
      rawPrompt = `Generate comprehensive unit and integration tests for: ${target || 'core modules'}.`;
    }

    let convId = activeId;
    let targetConv = conversations.find((c) => c.id === convId);

    // If no conversation exists or starting fresh, create new conversation
    if (!convId || !targetConv) {
      convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const titleBase =
        rawPrompt ||
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

    // Check if user uploaded a ZIP archive attachment directly -> import as artifact!
    const zipAtt = attachmentsToSend.find((a) => a.type === 'zip' && a.extractedFiles && a.extractedFiles.length > 0);
    if (zipAtt && !artifacts[convId]) {
      // Create initial project representation from ZIP files
      const zipFiles = (zipAtt.extractedFiles || []).map((p) => ({
        path: p,
        name: p.split('/').pop() || p,
        content: `// Content extracted from ${p}`,
        language: p.split('.').pop() || 'plaintext',
        updatedAt: Date.now(),
      }));

      const importedProject: ArtifactProject = {
        id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        conversationId: convId,
        name: zipAtt.name.replace(/\.zip$/i, ''),
        title: `Imported Archive: ${zipAtt.name}`,
        description: `Imported from ${zipAtt.name} (${zipFiles.length} files)`,
        files: zipFiles,
        activeFilePath: zipFiles[0]?.path || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      };

      setArtifacts((prev) => ({ ...prev, [convId!]: importedProject }));
      saveArtifactForConversation(convId, importedProject);
      setIsArtifactOpen(true);
    }

    const userMessage: ChatMessageType = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: rawPrompt,
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
      // --- Project-Aware AI Context Management (Phase 3 & 5) ---
      const currentProj = artifacts[convId];
      let contextualizedMessages = [...updatedMessages];

      if (currentProj && currentProj.files.length > 0) {
        const projectContext = buildProjectContext(currentProj, rawPrompt);
        if (projectContext.hasContext && projectContext.systemPromptAddition) {
          contextualizedMessages = [
            ...updatedMessages.slice(0, -1),
            {
              id: `ctx_${Date.now()}`,
              role: 'system',
              content: projectContext.systemPromptAddition,
              createdAt: Date.now(),
            },
            updatedMessages[updatedMessages.length - 1],
          ];
        }
      }

      const apiMessages = contextualizedMessages.map((m) => ({
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
        let fullText = '';
        let fullReasoning = '';
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

                if (parsed.reasoning) {
                  fullReasoning += parsed.reasoning;
                }

                if (parsed.delta) {
                  fullText += parsed.delta;

                  // Real-time stage detection (Phase 4)
                  const stageInfo = detectCurrentGenerationStage(fullText);
                  setGenerationStage(stageInfo.stage);
                  setGenerationPercent(stageInfo.percent);

                  // Auto-open workspace when project tags appear in stream (Phase 11 & 13)
                  if (!isArtifactOpen && (fullText.includes('<raizel_artifact') || fullText.includes('<raizel_operation'))) {
                    setIsArtifactOpen(true);
                  }

                  // Progressive file extraction: update file tree as files complete streaming
                  const streamedFiles = extractStreamingFiles(fullText);
                  if (streamedFiles.length > 0) {
                    const existing = artifacts[convId];
                    if (!existing || streamedFiles.length > existing.files.length) {
                      const liveProject: ArtifactProject = {
                        id: existing?.id || `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        conversationId: convId,
                        name: existing?.name || 'project',
                        title: existing?.title || 'Building Project...',
                        description: existing?.description,
                        files: streamedFiles,
                        activeFilePath: existing?.activeFilePath && streamedFiles.some((f) => f.path === existing.activeFilePath)
                          ? existing.activeFilePath
                          : streamedFiles[streamedFiles.length - 1]?.path || '',
                        createdAt: existing?.createdAt || Date.now(),
                        updatedAt: Date.now(),
                        version: existing?.version || 1,
                      };
                      setArtifacts((prev) => ({ ...prev, [convId!]: liveProject }));
                    }
                  }
                }

                if (parsed.delta || parsed.reasoning) {
                  setIsThinking(false);

                  // Update assistant message incrementally
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id === convId
                        ? {
                            ...c,
                            messages: c.messages.map((m) =>
                              m.id === assistantMessageId
                                ? {
                                    ...m,
                                    content: fullText,
                                    reasoning: fullReasoning || undefined,
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

        // Post-stream: Inspect accumulated response for Artifacts or Operations
        const parsedArtifact = parseArtifactFromResponse(fullText);

        if (parsedArtifact.project && parsedArtifact.project.files.length > 0) {
          const existing = artifacts[convId];
          const newArtifact: ArtifactProject = {
            id: existing?.id || `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            conversationId: convId,
            name: parsedArtifact.project.name,
            title: parsedArtifact.project.title,
            description: parsedArtifact.project.description,
            files: parsedArtifact.project.files,
            activeFilePath: parsedArtifact.project.files[0]?.path || '',
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now(),
            version: (existing?.version || 0) + 1,
          };

          startTransition(() => {
            setArtifacts((prev) => ({ ...prev, [convId!]: newArtifact }));
            setIsArtifactOpen(true);
          });
          saveArtifactForConversation(convId, newArtifact);

          // Update assistant message with artifactSummary
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            hasArtifact: true,
                            artifactSummary: {
                              name: newArtifact.name,
                              title: newArtifact.title,
                              fileCount: newArtifact.files.length,
                            },
                          }
                        : m
                    ),
                  }
                : c
            )
          );
        } else if (parsedArtifact.operations && parsedArtifact.operations.length > 0) {
          // Operations update to existing artifact
          const existingArtifact = artifacts[convId];
          if (existingArtifact) {
            const updatedArtifact = applyArtifactOperations(existingArtifact, parsedArtifact.operations);
            startTransition(() => {
              setArtifacts((prev) => ({ ...prev, [convId!]: updatedArtifact }));
              setIsArtifactOpen(true);
            });
            saveArtifactForConversation(convId, updatedArtifact);

            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              hasArtifact: true,
                              artifactSummary: {
                                name: updatedArtifact.name,
                                title: updatedArtifact.title,
                                fileCount: updatedArtifact.files.length,
                              },
                            }
                          : m
                      ),
                    }
                  : c
              )
            );
          }
        }
      } else {
        // Non-streaming fallback
        const result = await response.json();
        setIsThinking(false);
        const responseText = result.content || '';

        const parsedArtifact = parseArtifactFromResponse(responseText);

        let artifactSummaryData: { name: string; title: string; fileCount: number } | undefined;

        if (parsedArtifact.project && parsedArtifact.project.files.length > 0) {
          const newArtifact: ArtifactProject = {
            id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            conversationId: convId,
            name: parsedArtifact.project.name,
            title: parsedArtifact.project.title,
            description: parsedArtifact.project.description,
            files: parsedArtifact.project.files,
            activeFilePath: parsedArtifact.project.files[0]?.path || '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
          };
          setArtifacts((prev) => ({ ...prev, [convId!]: newArtifact }));
          setIsArtifactOpen(true);
          saveArtifactForConversation(convId, newArtifact);
          artifactSummaryData = {
            name: newArtifact.name,
            title: newArtifact.title,
            fileCount: newArtifact.files.length,
          };
        } else if (parsedArtifact.operations && parsedArtifact.operations.length > 0 && artifacts[convId]) {
          const updated = applyArtifactOperations(artifacts[convId], parsedArtifact.operations);
          setArtifacts((prev) => ({ ...prev, [convId!]: updated }));
          setIsArtifactOpen(true);
          saveArtifactForConversation(convId, updated);
          artifactSummaryData = {
            name: updated.name,
            title: updated.title,
            fileCount: updated.files.length,
          };
        }

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content: responseText,
                          hasArtifact: Boolean(artifactSummaryData),
                          artifactSummary: artifactSummaryData,
                        }
                      : m
                  ),
                }
              : c
          )
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
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
      {/* Left Sidebar */}
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

      {/* Center Main Chat Area */}
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
            {/* Toggle Artifact Workspace Button (if active project exists) */}
            {activeArtifact && (
              <button
                type="button"
                onClick={() => setIsArtifactOpen(!isArtifactOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  isArtifactOpen
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-950/40'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border-white/[0.08]'
                }`}
                title="Toggle code workspace"
              >
                <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Workspace</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] font-mono text-indigo-200">
                  {activeArtifact.files.length}
                </span>
              </button>
            )}

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
            <WelcomeScreen
              onSelectPrompt={(prompt) => handleSendMessage(prompt)}
              onSelectTemplate={handleSelectTemplate}
            />
          ) : (
            <div className="max-w-4xl mx-auto w-full space-y-4 pb-4">
              {currentMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onRetry={msg.isError ? handleRetry : undefined}
                  onOpenArtifact={() => setIsArtifactOpen(true)}
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

      {/* Right Persistent Code / Artifact Workspace */}
      <ArtifactWorkspace
        project={activeArtifact}
        isOpen={isArtifactOpen && Boolean(activeArtifact)}
        onClose={() => setIsArtifactOpen(false)}
        onSaveFileContent={handleSaveFileContent}
        onSelectFile={handleSelectFile}
        isGenerating={isLoading}
        generationStage={generationStage}
        generationPercent={generationPercent}
        onTriggerProjectAction={handleTriggerProjectAction}
        onAskAiToFix={handleAskAiToFix}
      />

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

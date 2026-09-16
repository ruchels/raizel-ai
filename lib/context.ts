import type { ArtifactProject } from '@/types/artifact';
import type { ProjectIndex } from '@/types/project';
import type { MemoryItem } from '@/types/memory';
import { buildProjectIndex, formatFileTreeForModel, formatManifestForModel } from '@/lib/project/indexer';
import { retrieveContext, formatSlicesForModel } from '@/lib/project/retrieval';
import { formatMemoriesForModel, retrieveMemories, type RetrievedMemory } from '@/lib/memory/engine';

/**
 * Assembles the system context for one request.
 *
 * Order matters: durable memory first (it shapes tone and defaults), then the
 * project manifest (what the codebase *is*), then the file tree (what exists),
 * then only the file bodies that scored high enough to earn their tokens.
 */

export interface BuildContextInput {
  project: ArtifactProject | null;
  /** Prebuilt index; rebuilt from project files when absent. */
  index?: ProjectIndex | null;
  userMessage: string;
  memories: MemoryItem[];
  memoryLimit: number;
  memoryEnabled: boolean;
  allowFileRequests: boolean;
  /** Paths already sent this turn (e.g. resolved tool calls). */
  alreadyIncluded?: string[];
  budgetChars?: number;
}

export interface BuiltContext {
  hasContext: boolean;
  systemContext: string;
  includedFiles: string[];
  omittedFiles: string[];
  usedMemories: RetrievedMemory[];
  charCount: number;
}

/** Builds (or reuses) the index for a workspace project. */
export function indexFromProject(project: ArtifactProject): ProjectIndex {
  return buildProjectIndex(
    project.files.map((f) => ({
      path: f.path,
      content: f.isReadable === false ? null : f.content,
      bytes: f.content ? f.content.length : 0,
      unreadableReason: f.isReadable === false ? 'binary' : undefined,
      unreadableDetail: f.unreadableReason,
    })),
    project.name
  );
}

const TOOL_INSTRUCTIONS = `FILE ACCESS
You are seeing a selection of the project, not all of it. When you need more,
request it and stop — the result is returned to you in the next turn:

  <raizel_request tool="read_file" path="lib/auth.ts" />
  <raizel_request tool="read_range" path="app/page.tsx" start="120" end="260" />
  <raizel_request tool="read_multiple_files" paths="lib/db.ts,lib/schema.ts" />
  <raizel_request tool="search_in_project" query="createSession" />
  <raizel_request tool="list_files" path="components/" />

Never guess the contents of a file you have not been shown. If a file is marked
UNREADABLE, say so rather than inventing its contents.`;

export function buildContext(input: BuildContextInput): BuiltContext {
  const sections: string[] = [];
  const includedFiles: string[] = [];
  let omittedFiles: string[] = [];
  let usedMemories: RetrievedMemory[] = [];

  /* 1. Long-term memory */
  if (input.memoryEnabled && input.memories.length > 0) {
    usedMemories = retrieveMemories(input.memories, input.userMessage, input.memoryLimit);
    const block = formatMemoriesForModel(usedMemories);
    if (block) sections.push(block);
  }

  /* 2. Project understanding */
  if (input.project && input.project.files.length > 0) {
    const index = input.index ?? indexFromProject(input.project);
    const editedByUser = input.project.files.filter((f) => f.editedByUser).map((f) => f.path);

    sections.push(
      ['ACTIVE PROJECT', formatManifestForModel(index.manifest)].join('\n')
    );

    sections.push(['FILE TREE', formatFileTreeForModel(index)].join('\n'));

    const retrieval = retrieveContext({
      index,
      query: input.userMessage,
      activeFilePath: input.project.activeFilePath,
      userEditedPaths: editedByUser,
      alreadyIncluded: input.alreadyIncluded,
      budgetChars: input.budgetChars ?? 60000,
    });

    includedFiles.push(...retrieval.slices.map((s) => s.path));
    omittedFiles = retrieval.omitted;

    if (retrieval.slices.length > 0) {
      sections.push(
        [
          `RELEVANT FILE CONTENTS (${retrieval.slices.length} of ${index.files.length} files, selected for this request)`,
          formatSlicesForModel(retrieval),
        ].join('\n')
      );
    }

    if (editedByUser.length > 0) {
      sections.push(
        `USER EDITS\nThe user hand-edited these files: ${editedByUser.join(', ')}. The versions above are their current state. Build on them; do not revert them.`
      );
    }

    const unreadable = index.files.filter((f) => f.content === null);
    if (unreadable.length > 0) {
      const sample = unreadable.slice(0, 10).map((f) => f.path).join(', ');
      sections.push(
        `UNREADABLE FILES\n${unreadable.length} file(s) exist in this project but their contents were never read (binary, too large, or undecodable): ${sample}${unreadable.length > 10 ? ', ...' : ''}. Do not describe their contents.`
      );
    }

    if (input.allowFileRequests) sections.push(TOOL_INSTRUCTIONS);

    if (input.project.plan) {
      const plan = input.project.plan;
      const lines = plan.phases.map(
        (p, i) => `${i + 1}. [${p.status}] ${p.title}${p.filesTouched.length ? ` — ${p.filesTouched.length} files` : ''}`
      );
      sections.push(
        [`BUILD PLAN — goal: ${plan.goal}`, ...lines, 'Work on the phase marked "active". Do not jump ahead.'].join('\n')
      );
    }
  }

  const systemContext = sections.join('\n\n═══════════════════════════════\n\n');

  return {
    hasContext: sections.length > 0,
    systemContext,
    includedFiles,
    omittedFiles,
    usedMemories,
    charCount: systemContext.length,
  };
}

/**
 * Renders attachments as a compact block. Attachments are attached to the
 * message they arrived with and are *not* replayed on later turns — the
 * caller is responsible for only passing current-turn attachments here.
 */
export function formatAttachmentsForModel(
  attachments: Array<{ name: string; type: string; status: string; statusDetail?: string; content?: string; lineCount?: number; language?: string }>
): string {
  const blocks: string[] = [];

  for (const att of attachments) {
    if (att.type === 'image') continue; // images go through the multimodal channel

    if (att.status === 'failed') {
      blocks.push(
        `[ATTACHMENT ${att.name} — NOT READ]\n${att.statusDetail || 'This file could not be read.'} Do not speculate about its contents.`
      );
      continue;
    }

    if (att.type === 'zip') {
      blocks.push(
        `[ATTACHMENT ${att.name} — imported into the workspace]\n${att.statusDetail || ''}\nThe files are available through the project context above and the file access tools.`
      );
      continue;
    }

    if (att.content) {
      const header = `[ATTACHMENT ${att.name}${att.lineCount ? ` — ${att.lineCount} lines` : ''}]`;
      blocks.push(`${header}\n\`\`\`${att.language || ''}\n${att.content}\n\`\`\``);
    }
  }

  return blocks.join('\n\n');
}

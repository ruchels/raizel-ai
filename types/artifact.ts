import type { ProjectManifest, ProjectPlan } from './project';

export interface ArtifactFile {
  /** Normalized POSIX-relative path, e.g. "app/page.tsx". */
  path: string;
  name: string;
  content: string;
  language: string;
  /** Content before the most recent change, used to render diffs. */
  previousContent?: string;
  /** True when the current session changed this file. */
  isModified?: boolean;
  /** Set when the file came from an import and was edited by the user, not the AI. */
  editedByUser?: boolean;
  /**
   * False for binary/undecodable files that exist in the project but whose
   * contents were never read. `content` is empty and must not be presented
   * as the real file.
   */
  isReadable?: boolean;
  unreadableReason?: string;
  updatedAt: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
  language?: string;
  isModified?: boolean;
  isReadable?: boolean;
}

export type ArtifactOperationType = 'create_file' | 'update_file' | 'delete_file' | 'rename_file';

export interface ArtifactOperation {
  operation: ArtifactOperationType;
  path: string;
  newPath?: string;
  content?: string;
  language?: string;
  /** Why the model made this change. Surfaced in the changes panel. */
  reason?: string;
}

/** Result of applying one operation, so the UI reflects what actually happened. */
export interface AppliedOperation {
  operation: ArtifactOperationType;
  path: string;
  newPath?: string;
  status: 'applied' | 'skipped';
  skipReason?: string;
  addedLines: number;
  removedLines: number;
  reason?: string;
}

export type ArtifactOrigin = 'generated' | 'imported' | 'template';

export interface ArtifactProject {
  id: string;
  conversationId: string;
  name: string;
  title: string;
  description?: string;
  files: ArtifactFile[];
  activeFilePath: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  origin?: ArtifactOrigin;
  /** Derived understanding of the project; rebuilt whenever files change. */
  manifest?: ProjectManifest;
  /** Multi-phase plan for large builds. */
  plan?: ProjectPlan;
  /** Operations applied in the most recent assistant turn. */
  lastChanges?: AppliedOperation[];
}

export interface ProjectTemplate {
  id: string;
  name: string;
  category: 'web' | 'backend' | 'python' | 'security';
  description: string;
  project: Pick<ArtifactProject, 'name' | 'title' | 'description' | 'files' | 'activeFilePath'>;
}

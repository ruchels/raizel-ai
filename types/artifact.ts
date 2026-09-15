export interface ArtifactFile {
  path: string;            // Normalized path, e.g. "app/page.tsx"
  name: string;            // Basename, e.g. "page.tsx"
  content: string;         // File content text
  language: string;        // Language identifier, e.g. "tsx", "css", "json"
  previousContent?: string;// Previous content before AI update (for diff)
  isModified?: boolean;    // Flagged if modified in the current session
  updatedAt: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
  language?: string;
  isModified?: boolean;
}

export type ArtifactOperationType =
  | 'create_file'
  | 'update_file'
  | 'delete_file'
  | 'rename_file';

export interface ArtifactOperation {
  operation: ArtifactOperationType;
  path: string;
  newPath?: string;
  content?: string;
  language?: string;
}

export interface ProjectBuildStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  detail?: string;
}

export interface ProjectBuildState {
  isBuilding: boolean;
  projectName?: string;
  currentStepIndex: number;
  steps: ProjectBuildStep[];
}

export interface ArtifactProject {
  id: string;
  conversationId: string;
  name: string;            // e.g. "portfolio"
  title: string;           // Display title, e.g. "Modern Portfolio Website"
  description?: string;
  files: ArtifactFile[];
  activeFilePath: string;  // Path of currently viewed file
  createdAt: number;
  updatedAt: number;
  version: number;
  buildState?: ProjectBuildState;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  icon: string;
  category: 'web' | 'backend' | 'cybersecurity' | 'python' | 'dashboard';
  description: string;
  project: Omit<ArtifactProject, 'id' | 'conversationId' | 'createdAt' | 'updatedAt' | 'version'>;
}

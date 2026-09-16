/**
 * Types for the file-understanding and project-indexing pipeline.
 *
 * Pipeline: upload -> detect -> extract -> normalize -> index -> manifest -> retrieval
 */

export type FileKind =
  | 'code'
  | 'style'
  | 'markup'
  | 'config'
  | 'doc'
  | 'data'
  | 'image'
  | 'binary'
  | 'unknown';

/** Why a file could not be read as text. Surfaced to the user verbatim. */
export type UnreadableReason =
  | 'binary'
  | 'too_large'
  | 'decode_failed'
  | 'unsupported_format'
  | 'extract_failed';

export interface ExtractionResult {
  ok: boolean;
  text: string;
  /** Present only when ok === false. */
  reason?: UnreadableReason;
  /** Human readable explanation shown in the UI. Never fabricated. */
  detail?: string;
  /** True when the extractor converted a non-plaintext container (pdf, docx). */
  converted?: boolean;
  /** Original byte length. */
  bytes: number;
}

/** Symbols parsed out of a source file. Regex-based, best-effort, never guessed. */
export interface FileSymbols {
  imports: string[];
  exports: string[];
  /** Top-level function / class / component names. */
  definitions: string[];
}

export interface IndexedFile {
  path: string;
  name: string;
  ext: string;
  kind: FileKind;
  language: string;
  bytes: number;
  lineCount: number;
  /** Null when the file could not be read; `unreadableReason` explains why. */
  content: string | null;
  unreadableReason?: UnreadableReason;
  unreadableDetail?: string;
  symbols: FileSymbols;
  /** Resolved project-relative paths this file imports. */
  dependsOn: string[];
  /** Resolved project-relative paths that import this file. */
  dependedOnBy: string[];
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'pip' | 'cargo' | 'go' | 'composer';

export interface ProjectDependency {
  name: string;
  version: string;
  dev: boolean;
}

export interface ProjectManifest {
  /** Root directory name inferred from the archive or project. */
  name: string;
  fileCount: number;
  totalBytes: number;
  readableCount: number;
  unreadableCount: number;
  directories: string[];
  /** Detected frameworks/runtimes, e.g. ["Next.js", "React", "Tailwind CSS"]. */
  stack: string[];
  packageManagers: PackageManager[];
  dependencies: ProjectDependency[];
  /** Files that look like application entry points. */
  entryPoints: string[];
  /** Config files (package.json, tsconfig.json, next.config.*, Dockerfile, ...). */
  configs: string[];
  /** README / docs / licence files. */
  documentation: string[];
  /** Environment variable names referenced anywhere in the project. */
  envVars: string[];
  /** Paths that were skipped because they matched the secret blocklist. */
  excludedPaths: string[];
  scripts: Record<string, string>;
  builtAt: number;
}

export interface ProjectIndex {
  manifest: ProjectManifest;
  files: IndexedFile[];
  /** path -> index into `files`, for O(1) lookup. */
  byPath: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */
/* ------------------------------------------------------------------ */

export interface RetrievedSlice {
  path: string;
  language: string;
  /** 1-based inclusive line range actually included. */
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
  /** Whether the whole file was included. */
  complete: boolean;
  reasons: string[];
  score: number;
}

export interface RetrievalResult {
  slices: RetrievedSlice[];
  /** Files considered relevant but omitted for budget reasons. */
  omitted: string[];
  usedChars: number;
  budgetChars: number;
}

/* ------------------------------------------------------------------ */
/* Model-driven file access tools                                      */
/* ------------------------------------------------------------------ */

export type ProjectToolName =
  | 'list_files'
  | 'read_file'
  | 'read_range'
  | 'read_multiple_files'
  | 'search_in_project';

export interface ProjectToolCall {
  tool: ProjectToolName;
  path?: string;
  paths?: string[];
  query?: string;
  startLine?: number;
  endLine?: number;
  /** Raw tag text, so it can be stripped from the rendered message. */
  raw: string;
}

export interface ProjectToolResult {
  call: ProjectToolCall;
  ok: boolean;
  output: string;
}

/* ------------------------------------------------------------------ */
/* Phased delivery for large projects                                  */
/* ------------------------------------------------------------------ */

export type PhaseStatus = 'pending' | 'active' | 'done';

export interface ProjectPhase {
  id: string;
  title: string;
  status: PhaseStatus;
  /** Files actually written while this phase was active. */
  filesTouched: string[];
  startedAt?: number;
  completedAt?: number;
}

export interface ProjectPlan {
  goal: string;
  phases: ProjectPhase[];
  createdAt: number;
  updatedAt: number;
}

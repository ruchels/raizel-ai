import JSZip from 'jszip';
import type { FileAttachment } from '@/types/chat';
import type { ArtifactFile, ArtifactProject } from '@/types/artifact';
import type { ProjectIndex } from '@/types/project';
import { normalizeRelativePath, isSafeExportPath } from '@/lib/zip';
import { extractTextFromBuffer, readFileAsDataURL } from '@/lib/fs/extract';
import { buildProjectIndex, type RawProjectFile } from '@/lib/project/indexer';
import {
  countLines,
  formatBytes,
  getExtension,
  inferLanguage,
  isArchivePath,
  isImagePath,
  isTextLike,
  MAX_PROJECT_TEXT_BYTES,
} from '@/lib/fs/fileTypes';

export { formatBytes as formatFileSize } from '@/lib/fs/fileTypes';
export { readFileAsDataURL } from '@/lib/fs/extract';

/**
 * Attachment pipeline:
 *   upload -> detect type -> extract real text -> normalize -> report status
 *
 * When extraction fails the attachment records why. Nothing downstream is ever
 * allowed to claim a file was read when it was not.
 */

export function isImageFile(file: File | { name: string; type?: string }): boolean {
  if (file.type?.startsWith('image/')) return true;
  return isImagePath(file.name);
}

export function isZipFile(file: File | { name: string; type?: string }): boolean {
  if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed') return true;
  return isArchivePath(file.name);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Hard ceiling on a single upload so the browser tab stays responsive. */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

export async function processUploadedFile(file: File): Promise<FileAttachment> {
  const id = newId('att');

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      id,
      name: file.name,
      type: 'document',
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      status: 'failed',
      statusDetail: `File is ${formatBytes(file.size)}; the upload limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    };
  }

  /* --- images: sent to the model as-is for vision --- */
  if (isImageFile(file)) {
    try {
      const dataUrl = await readFileAsDataURL(file);
      return {
        id,
        name: file.name,
        type: 'image',
        size: file.size,
        mimeType: file.type || 'image/png',
        content: dataUrl,
        previewUrl: dataUrl,
        status: 'ready',
      };
    } catch {
      return {
        id,
        name: file.name,
        type: 'image',
        size: file.size,
        mimeType: file.type || 'image/png',
        status: 'failed',
        statusDetail: 'The image could not be decoded by the browser.',
      };
    }
  }

  /* --- archives: indexed into a project, not dumped as text --- */
  if (isZipFile(file)) {
    try {
      const summary = await summarizeZip(file);
      return {
        id,
        name: file.name,
        type: 'zip',
        size: file.size,
        mimeType: 'application/zip',
        status: summary.readable > 0 ? 'ready' : 'partial',
        statusDetail:
          summary.readable > 0
            ? `${summary.total} entries — ${summary.readable} readable, ${summary.skipped} binary or skipped.`
            : 'No readable text files were found in this archive.',
        extractedFiles: summary.paths,
        fileCount: summary.total,
        readableCount: summary.readable,
      };
    } catch (err) {
      return {
        id,
        name: file.name,
        type: 'zip',
        size: file.size,
        mimeType: 'application/zip',
        status: 'failed',
        statusDetail: `The archive could not be opened: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  }

  /* --- everything else: real text extraction --- */
  const buffer = await file.arrayBuffer();
  const result = await extractTextFromBuffer(file.name, buffer);

  if (!result.ok) {
    return {
      id,
      name: file.name,
      type: 'document',
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      status: 'failed',
      statusDetail: result.detail || `Could not read this file (${result.reason}).`,
    };
  }

  return {
    id,
    name: file.name,
    type: 'text',
    size: file.size,
    mimeType: file.type || 'text/plain',
    content: result.text,
    lineCount: countLines(result.text),
    language: inferLanguage(file.name),
    status: 'ready',
    statusDetail: result.converted
      ? `Converted from ${getExtension(file.name).toUpperCase()} to text (${countLines(result.text)} lines).`
      : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* ZIP handling                                                        */
/* ------------------------------------------------------------------ */

interface ZipSummary {
  paths: string[];
  total: number;
  readable: number;
  skipped: number;
}

async function summarizeZip(file: File): Promise<ZipSummary> {
  const zip = await JSZip.loadAsync(file);
  const paths: string[] = [];
  let readable = 0;
  let skipped = 0;

  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const normalized = normalizeRelativePath(rawPath);
    if (!normalized || !isSafeExportPath(normalized)) {
      skipped++;
      continue;
    }
    paths.push(normalized);
    if (isTextLike(normalized)) readable++;
    else skipped++;
  }

  return { paths, total: paths.length, readable, skipped };
}

export interface ZipImportProgress {
  processed: number;
  total: number;
  currentPath: string;
}

export interface ZipImportResult {
  project: ArtifactProject;
  index: ProjectIndex;
  skipped: Array<{ path: string; reason: string }>;
}

/**
 * Extracts an uploaded ZIP into a real project: every text file is decoded and
 * stored with its actual content, then indexed. Path traversal and secret
 * files are rejected before anything is read.
 */
export async function importProjectFromZip(
  file: File,
  conversationId: string,
  onProgress?: (progress: ZipImportProgress) => void
): Promise<ZipImportResult | null> {
  const zip = await JSZip.loadAsync(file);

  const entries = Object.entries(zip.files).filter(([, entry]) => !entry.dir);
  const skipped: Array<{ path: string; reason: string }> = [];
  const raw: RawProjectFile[] = [];

  let totalTextBytes = 0;
  let processed = 0;

  // Archives often wrap everything in a single top-level folder; strip it so
  // paths look like the real project ("app/page.tsx", not "repo-main/app/page.tsx").
  const normalizedPaths = entries.map(([path]) => normalizeRelativePath(path)).filter(Boolean);
  const commonRoot = findCommonRoot(normalizedPaths);

  for (const [rawPath, entry] of entries) {
    processed++;
    let path = normalizeRelativePath(rawPath);
    if (commonRoot && path.startsWith(`${commonRoot}/`)) path = path.slice(commonRoot.length + 1);

    if (!path) continue;
    onProgress?.({ processed, total: entries.length, currentPath: path });

    if (!isSafeExportPath(path)) {
      skipped.push({ path, reason: 'unsafe path or on the credential blocklist' });
      continue;
    }

    let buffer: ArrayBuffer;
    try {
      buffer = await entry.async('arraybuffer');
    } catch {
      skipped.push({ path, reason: 'could not be decompressed' });
      continue;
    }

    if (totalTextBytes > MAX_PROJECT_TEXT_BYTES) {
      skipped.push({ path, reason: 'project text budget exceeded' });
      raw.push({
        path,
        content: null,
        bytes: buffer.byteLength,
        unreadableReason: 'too_large',
        unreadableDetail: 'Skipped: the project text budget was already exhausted.',
      });
      continue;
    }

    const extraction = await extractTextFromBuffer(path, buffer);
    if (extraction.ok) {
      totalTextBytes += extraction.text.length;
      raw.push({ path, content: extraction.text, bytes: buffer.byteLength });
    } else {
      raw.push({
        path,
        content: null,
        bytes: buffer.byteLength,
        unreadableReason: extraction.reason,
        unreadableDetail: extraction.detail,
      });
    }
  }

  if (raw.length === 0) return null;

  const projectName = (commonRoot || file.name.replace(/\.zip$/i, '') || 'imported-project').trim();
  const index = buildProjectIndex(raw, projectName);
  index.manifest.excludedPaths = skipped.map((s) => s.path);

  const files: ArtifactFile[] = index.files.map((f) => ({
    path: f.path,
    name: f.name,
    content: f.content ?? '',
    language: f.language,
    updatedAt: Date.now(),
    isReadable: f.content !== null,
    unreadableReason: f.unreadableDetail,
  }));

  const firstInteresting =
    index.manifest.entryPoints[0] ||
    index.manifest.documentation[0] ||
    index.files.find((f) => f.content !== null)?.path ||
    files[0]?.path ||
    '';

  const now = Date.now();
  const project: ArtifactProject = {
    id: newId('art'),
    conversationId,
    name: index.manifest.name,
    title: index.manifest.name,
    description: `Imported from ${file.name}`,
    files,
    activeFilePath: firstInteresting,
    createdAt: now,
    updatedAt: now,
    version: 1,
    origin: 'imported',
    manifest: index.manifest,
  };

  return { project, index, skipped };
}

function findCommonRoot(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const firstSegments = paths.map((p) => p.split('/')[0]);
  const root = firstSegments[0];
  if (!root || firstSegments.some((s) => s !== root)) return null;
  // Only strip if it really is a wrapper directory (every path is nested).
  if (paths.some((p) => !p.includes('/'))) return null;
  return root;
}

/* ------------------------------------------------------------------ */
/* Pasted snippets                                                     */
/* ------------------------------------------------------------------ */

const SNIPPET_SIGNATURES: Array<[RegExp, string]> = [
  [/^\s*[[{][\s\S]*[\]}]\s*$/, 'json'],
  [/^\s*<\?php/, 'php'],
  [/^\s*<!DOCTYPE|^\s*<html/i, 'html'],
  [/\b(?:import\s+React|export\s+default|className=|useState\()/, 'tsx'],
  [/\b(?:interface\s+\w+\s*\{|:\s*(?:string|number|boolean)\b|export\s+type\s)/, 'ts'],
  [/^\s*(?:def|class)\s+\w+|^\s*from\s+\w+\s+import/m, 'py'],
  [/^\s*#include\b|\bint\s+main\s*\(/, 'c'],
  [/^\s*(?:package|func)\s+\w+/m, 'go'],
  [/\b(?:SELECT|INSERT INTO|CREATE TABLE)\b/i, 'sql'],
  [/^\s*(?:function|const|let|var)\s+\w+/m, 'js'],
  [/^\s*#{1,6}\s+\S|^\s*[-*]\s+\S/m, 'md'],
];

export function createPastedSnippetAttachment(pastedText: string): FileAttachment {
  let extension = 'txt';
  for (const [pattern, ext] of SNIPPET_SIGNATURES) {
    if (pattern.test(pastedText)) {
      extension = ext;
      break;
    }
  }

  const name = `pasted_snippet.${extension}`;
  return {
    id: newId('paste'),
    name,
    type: 'text',
    size: new Blob([pastedText]).size,
    mimeType: 'text/plain',
    content: pastedText,
    lineCount: countLines(pastedText),
    language: inferLanguage(name),
    status: 'ready',
  };
}

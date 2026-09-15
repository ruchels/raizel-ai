import JSZip from 'jszip';
import { ArtifactProject, ArtifactFile } from '@/types/artifact';

// Strict blacklist of files that must NEVER be packaged into exported ZIPs
const FORBIDDEN_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /(^|\/)\.env(\..+)?$/i,
  /(^|\/)node_modules\//i,
  /(^|\/)\.git\//i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
];

/**
 * Validates whether a file path is safe and permitted for project export
 */
export function isSafeExportPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;

  // Reject path traversal
  if (filePath.includes('..') || filePath.startsWith('/') || filePath.startsWith('\\')) {
    return false;
  }

  // Reject Windows drive letters
  if (/^[a-zA-Z]:/.test(filePath)) {
    return false;
  }

  // Reject sensitive / credential files
  for (const pattern of FORBIDDEN_FILE_PATTERNS) {
    if (pattern.test(filePath)) {
      return false;
    }
  }

  return true;
}

/**
 * Normalizes file path to standard POSIX-like relative format
 */
export function normalizeRelativePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\.?\/+/, '')
    .replace(/\/+/g, '/');
}

/**
 * Compiles an ArtifactProject into a downloadable JSZip Blob
 */
export async function generateProjectZip(project: ArtifactProject): Promise<Blob> {
  const zip = new JSZip();
  const rootFolderName = project.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'raizel-project';
  const folder = zip.folder(rootFolderName) || zip;

  for (const file of project.files) {
    const normalized = normalizeRelativePath(file.path);
    if (!isSafeExportPath(normalized)) {
      console.warn(`[ZIP] Excluded sensitive or unsafe file: ${file.path}`);
      continue;
    }

    // Split directory structure and add file
    folder.file(normalized, file.content || '');
  }

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Initiates an automatic browser download for a Blob
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Packages and triggers download of the complete project artifact
 */
export async function downloadProjectZip(project: ArtifactProject): Promise<void> {
  const blob = await generateProjectZip(project);
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'project';
  const filename = `raizel-${safeName}-${dateStr}.zip`;
  triggerBrowserDownload(blob, filename);
}

/**
 * Downloads a single file from the artifact workspace
 */
export function downloadSingleFile(file: ArtifactFile): void {
  const normalized = normalizeRelativePath(file.path);
  if (!isSafeExportPath(normalized)) {
    alert('This file cannot be exported for security reasons.');
    return;
  }

  const blob = new Blob([file.content || ''], { type: 'text/plain;charset=utf-8' });
  const filename = file.name || normalized.split('/').pop() || 'file.txt';
  triggerBrowserDownload(blob, filename);
}

/**
 * Exports project metadata and sanitized files as a JSON string
 */
export function exportProjectJson(project: ArtifactProject): void {
  const sanitizedFiles = project.files.filter((f) => isSafeExportPath(normalizeRelativePath(f.path)));
  const exportData = {
    raizelArtifactVersion: 1,
    name: project.name,
    title: project.title,
    description: project.description,
    exportedAt: new Date().toISOString(),
    files: sanitizedFiles.map((f) => ({
      path: normalizeRelativePath(f.path),
      name: f.name,
      language: f.language,
      content: f.content,
    })),
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const filename = `raizel-${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-export.json`;
  triggerBrowserDownload(blob, filename);
}

import JSZip from 'jszip';
import { ArtifactProject, ArtifactFile } from '@/types/artifact';

// Strict blacklist of file patterns that must NEVER be packaged into exported ZIPs
const FORBIDDEN_FILE_PATTERNS: RegExp[] = [
  // Environment & configuration secrets
  /^\.env(\..+)?$/i,
  /(^|\/)\.env(\..+)?$/i,
  /(^|\/)secrets?(\..+)?$/i,
  /(^|\/)credentials(\..+)?$/i,
  /(^|\/)service-account.*\.json$/i,
  /(^|\/)client_secret.*\.json$/i,
  // Node / Git system folders
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)\.svn(\/|$)/i,
  /(^|\/)\.hg(\/|$)/i,
  // System caches & artifacts
  /(^|\/)\.DS_Store$/i,
  /(^|\/)Thumbs\.db$/i,
  /(^|\/)\.next(\/|$)/i,
  /(^|\/)\.cache(\/|$)/i,
  // Cryptographic keys & certificates
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.pkcs12$/i,
  /\.crt$/i,
  /\.cer$/i,
  /(^|\/)id_rsa(\..+)?$/i,
  /(^|\/)id_ed25519(\..+)?$/i,
  /(^|\/)id_ecdsa(\..+)?$/i,
  /(^|\/)id_dsa(\..+)?$/i,
  // Cloud & shell credentials
  /(^|\/)\.aws(\/|$)/i,
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.kube(\/|$)/i,
  /(^|\/)\.bash_history$/i,
  /(^|\/)\.zsh_history$/i,
];

// Reserved device names in Windows that must not be created or exported
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * Normalizes file path to standard POSIX-like relative format.
 * Strips leading/trailing slashes, resolves `./`, removes duplicate slashes,
 * and decodes basic URL-encoded traversal tokens.
 */
export function normalizeRelativePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') return '';

  let normalized = filePath.trim();

  // Decode common encoded traversal vectors safely
  try {
    if (normalized.includes('%')) {
      normalized = decodeURIComponent(normalized);
    }
  } catch {
    // If malformed URI encoding, keep original and let isSafeExportPath reject it
  }

  // Convert all backslashes to forward slashes
  normalized = normalized.replace(/\\/g, '/');

  // Strip null bytes and control characters
  normalized = normalized.replace(/[\x00-\x1f\x7f]/g, '');

  // Strip leading drive letters (e.g. C:/)
  normalized = normalized.replace(/^[a-zA-Z]:[/]*/, '');

  // Strip leading `./` or `/`
  normalized = normalized.replace(/^\.?\/+/, '');

  // Collapse multiple consecutive slashes
  normalized = normalized.replace(/\/+/g, '/');

  // Strip trailing slashes
  normalized = normalized.replace(/\/+$/, '');

  return normalized;
}

/**
 * Validates whether a file path is safe and permitted for project export / operations.
 * Strictly prevents path traversal, Windows drive letters, encoded bypasses,
 * Windows reserved device names, and blacklisted sensitive files.
 */
export function isSafeExportPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;

  const raw = filePath.trim();

  // Reject null bytes, carriage returns, newlines
  if (/[\0\r\n]/.test(raw)) return false;

  // Reject URL encoded traversal vectors (%2e%2e, %2f, %5c)
  if (/%2e|%2f|%5c/i.test(raw)) return false;

  // Reject path traversal tokens
  if (raw.includes('..') || raw.includes('/../') || raw.includes('\\..\\')) {
    return false;
  }

  // Reject absolute paths and UNC network paths
  if (raw.startsWith('/') || raw.startsWith('\\') || raw.startsWith('//') || raw.startsWith('\\\\')) {
    return false;
  }

  // Reject Windows drive letters (e.g. C:, D:)
  if (/^[a-zA-Z]:/i.test(raw)) {
    return false;
  }

  const normalized = normalizeRelativePath(raw);
  if (!normalized || normalized === '.' || normalized === '..') {
    return false;
  }

  // Double check segments for traversal and reserved names
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') return false;
    if (WINDOWS_RESERVED_NAMES.test(seg)) return false;
    // Disallow dangerous characters in filenames
    if (/[<>:"|?*]/.test(seg)) return false;
  }

  // Reject sensitive / credential / secret files
  for (const pattern of FORBIDDEN_FILE_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  return true;
}

// Regex patterns for detecting leaked secrets within file text content
const SENSITIVE_CONTENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE KEY-----[\s\S]*?-----END (?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE KEY-----/gi, label: 'Private Key' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS Access Key ID' },
  { pattern: /\bghp_[a-zA-Z0-9]{36}\b/g, label: 'GitHub Personal Access Token' },
  { pattern: /\bgithub_pat_[a-zA-Z0-9_]{82}\b/g, label: 'GitHub Fine-Grained PAT' },
  { pattern: /\bsk-(?:proj|live|test)?[a-zA-Z0-9_-]{24,}\b/g, label: 'OpenAI/Provider Secret Key' },
  { pattern: /\b(?:rindri|rnd)_[a-zA-Z0-9]{20,}\b/gi, label: 'Rindri Secret Token' },
  { pattern: /(?:api_key|apikey|secret_key|private_key|auth_token)\s*[:=]\s*["']([a-zA-Z0-9_\-.]{20,})["']/gi, label: 'Hardcoded Secret Assignment' },
];

/**
 * Scans file content for exposed credentials, private keys, or API tokens.
 * Redacts any detected secrets before packaging into exported archives.
 */
export function sanitizeFileContentForExport(content: string, filePath: string): {
  sanitized: string;
  hadSecrets: boolean;
  warnings: string[];
} {
  if (!content || typeof content !== 'string') {
    return { sanitized: '', hadSecrets: false, warnings: [] };
  }

  let sanitized = content;
  let hadSecrets = false;
  const warnings: string[] = [];

  for (const { pattern, label } of SENSITIVE_CONTENT_PATTERNS) {
    if (pattern.test(sanitized)) {
      hadSecrets = true;
      warnings.push(`Detected & redacted ${label} in ${filePath}`);
      // Replace sensitive token with security placeholder
      sanitized = sanitized.replace(pattern, (match) => {
        if (match.startsWith('-----BEGIN')) {
          return '-----BEGIN ENCRYPTED PRIVATE KEY-----\n[REDACTED_BY_RAIZEL_SECURITY]\n-----END ENCRYPTED PRIVATE KEY-----';
        }
        return '[REDACTED_BY_RAIZEL_SECURITY]';
      });
    }
  }

  return { sanitized, hadSecrets, warnings };
}

/**
 * Compiles an ArtifactProject into a downloadable JSZip Blob.
 * Performs rigorous path sanitization and content secret redaction.
 */
export async function generateProjectZip(project: ArtifactProject): Promise<Blob> {
  const zip = new JSZip();
  const rootFolderName = project.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'raizel-project';
  const folder = zip.folder(rootFolderName) || zip;

  const totalWarnings: string[] = [];

  for (const file of project.files) {
    const normalized = normalizeRelativePath(file.path);
    if (!isSafeExportPath(normalized)) {
      console.warn(`[ZIP Security] Excluded sensitive or unsafe file: ${file.path}`);
      continue;
    }

    // Inspect and sanitize content
    const { sanitized, hadSecrets, warnings } = sanitizeFileContentForExport(
      file.content || '',
      normalized
    );

    if (hadSecrets) {
      totalWarnings.push(...warnings);
    }

    folder.file(normalized, sanitized);
  }

  if (totalWarnings.length > 0) {
    console.info(`[ZIP Security] Sanitized ${totalWarnings.length} secrets from exported project archive.`);
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
 * Downloads a single file from the artifact workspace with safety checks.
 */
export function downloadSingleFile(file: ArtifactFile): void {
  const normalized = normalizeRelativePath(file.path);
  if (!isSafeExportPath(normalized)) {
    alert('This file cannot be exported for security reasons.');
    return;
  }

  const { sanitized } = sanitizeFileContentForExport(file.content || '', normalized);
  const blob = new Blob([sanitized], { type: 'text/plain;charset=utf-8' });
  const filename = file.name || normalized.split('/').pop() || 'file.txt';
  triggerBrowserDownload(blob, filename);
}

/**
 * Exports project metadata and sanitized files as a JSON string.
 */
export function exportProjectJson(project: ArtifactProject): void {
  const sanitizedFiles = project.files
    .filter((f) => isSafeExportPath(normalizeRelativePath(f.path)))
    .map((f) => {
      const norm = normalizeRelativePath(f.path);
      const { sanitized } = sanitizeFileContentForExport(f.content || '', norm);
      return {
        path: norm,
        name: f.name || norm.split('/').pop() || norm,
        language: f.language,
        content: sanitized,
      };
    });

  const exportData = {
    raizelArtifactVersion: 2,
    name: project.name,
    title: project.title,
    description: project.description,
    exportedAt: new Date().toISOString(),
    filesCount: sanitizedFiles.length,
    files: sanitizedFiles,
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const filename = `raizel-${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-export.json`;
  triggerBrowserDownload(blob, filename);
}

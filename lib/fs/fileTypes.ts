import type { FileKind } from '@/types/project';

/**
 * Single source of truth for how RAIZEL classifies files.
 * Everything else (attachments, ZIP import, project indexing) reads from here,
 * so support only ever has to be added in one place.
 */

interface ExtensionSpec {
  kind: FileKind;
  language: string;
}

const EXTENSIONS: Record<string, ExtensionSpec> = {
  // --- code ---
  ts: { kind: 'code', language: 'typescript' },
  mts: { kind: 'code', language: 'typescript' },
  cts: { kind: 'code', language: 'typescript' },
  tsx: { kind: 'code', language: 'tsx' },
  js: { kind: 'code', language: 'javascript' },
  mjs: { kind: 'code', language: 'javascript' },
  cjs: { kind: 'code', language: 'javascript' },
  jsx: { kind: 'code', language: 'jsx' },
  py: { kind: 'code', language: 'python' },
  rb: { kind: 'code', language: 'ruby' },
  go: { kind: 'code', language: 'go' },
  rs: { kind: 'code', language: 'rust' },
  java: { kind: 'code', language: 'java' },
  kt: { kind: 'code', language: 'kotlin' },
  swift: { kind: 'code', language: 'swift' },
  c: { kind: 'code', language: 'c' },
  h: { kind: 'code', language: 'c' },
  cpp: { kind: 'code', language: 'cpp' },
  cc: { kind: 'code', language: 'cpp' },
  hpp: { kind: 'code', language: 'cpp' },
  cs: { kind: 'code', language: 'csharp' },
  php: { kind: 'code', language: 'php' },
  sql: { kind: 'code', language: 'sql' },
  sh: { kind: 'code', language: 'bash' },
  bash: { kind: 'code', language: 'bash' },
  zsh: { kind: 'code', language: 'bash' },
  ps1: { kind: 'code', language: 'powershell' },
  lua: { kind: 'code', language: 'lua' },
  dart: { kind: 'code', language: 'dart' },
  vue: { kind: 'code', language: 'vue' },
  svelte: { kind: 'code', language: 'svelte' },
  prisma: { kind: 'code', language: 'prisma' },
  graphql: { kind: 'code', language: 'graphql' },
  gql: { kind: 'code', language: 'graphql' },

  // --- style ---
  css: { kind: 'style', language: 'css' },
  scss: { kind: 'style', language: 'scss' },
  sass: { kind: 'style', language: 'scss' },
  less: { kind: 'style', language: 'less' },

  // --- markup ---
  html: { kind: 'markup', language: 'html' },
  htm: { kind: 'markup', language: 'html' },
  xml: { kind: 'markup', language: 'xml' },
  svg: { kind: 'markup', language: 'xml' },

  // --- config ---
  json: { kind: 'config', language: 'json' },
  jsonc: { kind: 'config', language: 'json' },
  yaml: { kind: 'config', language: 'yaml' },
  yml: { kind: 'config', language: 'yaml' },
  toml: { kind: 'config', language: 'toml' },
  ini: { kind: 'config', language: 'ini' },
  env: { kind: 'config', language: 'bash' },
  lock: { kind: 'config', language: 'plaintext' },

  // --- docs ---
  md: { kind: 'doc', language: 'markdown' },
  markdown: { kind: 'doc', language: 'markdown' },
  mdx: { kind: 'doc', language: 'markdown' },
  txt: { kind: 'doc', language: 'plaintext' },
  rst: { kind: 'doc', language: 'plaintext' },
  pdf: { kind: 'doc', language: 'plaintext' },
  docx: { kind: 'doc', language: 'plaintext' },

  // --- data ---
  csv: { kind: 'data', language: 'csv' },
  tsv: { kind: 'data', language: 'csv' },
  ndjson: { kind: 'data', language: 'json' },

  // --- images ---
  png: { kind: 'image', language: 'binary' },
  jpg: { kind: 'image', language: 'binary' },
  jpeg: { kind: 'image', language: 'binary' },
  gif: { kind: 'image', language: 'binary' },
  webp: { kind: 'image', language: 'binary' },
  bmp: { kind: 'image', language: 'binary' },
  avif: { kind: 'image', language: 'binary' },
  ico: { kind: 'image', language: 'binary' },
};

/** Extension-less files that are still plain text and matter a lot. */
const KNOWN_FILENAMES: Record<string, ExtensionSpec> = {
  dockerfile: { kind: 'config', language: 'dockerfile' },
  makefile: { kind: 'config', language: 'makefile' },
  procfile: { kind: 'config', language: 'plaintext' },
  '.gitignore': { kind: 'config', language: 'plaintext' },
  '.dockerignore': { kind: 'config', language: 'plaintext' },
  '.npmrc': { kind: 'config', language: 'ini' },
  '.nvmrc': { kind: 'config', language: 'plaintext' },
  '.editorconfig': { kind: 'config', language: 'ini' },
  license: { kind: 'doc', language: 'plaintext' },
  readme: { kind: 'doc', language: 'markdown' },
};

/** Extensions that are containers we can convert to text with real parsers. */
export const CONVERTIBLE_EXTENSIONS = new Set(['pdf', 'docx']);

/** Binary formats we recognise but deliberately do not pretend to read. */
const KNOWN_BINARY = new Set([
  'zip', 'gz', 'tar', 'rar', '7z', 'bz2', 'xz',
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'class', 'jar', 'wasm',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'avi', 'flac', 'mkv',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'doc', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods',
  'db', 'sqlite', 'sqlite3', 'pyc', 'psd', 'ai', 'sketch', 'fig',
]);

export function getExtension(filePath: string): string {
  const base = filePath.split('/').pop() || filePath;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function getBaseName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function lookup(filePath: string): ExtensionSpec | undefined {
  const base = getBaseName(filePath).toLowerCase();
  if (KNOWN_FILENAMES[base]) return KNOWN_FILENAMES[base];

  // `.env.local`, `.env.production` etc.
  if (base.startsWith('.env')) return { kind: 'config', language: 'bash' };

  const ext = getExtension(filePath);
  if (!ext) return undefined;
  if (EXTENSIONS[ext]) return EXTENSIONS[ext];
  if (KNOWN_BINARY.has(ext)) return { kind: 'binary', language: 'binary' };
  return undefined;
}

export function getFileKind(filePath: string): FileKind {
  return lookup(filePath)?.kind ?? 'unknown';
}

export function inferLanguage(filePath: string): string {
  return lookup(filePath)?.language ?? 'plaintext';
}

/** True when the extension is a format we can decode into useful text. */
export function isTextLike(filePath: string): boolean {
  const kind = getFileKind(filePath);
  if (kind === 'binary' || kind === 'image') return false;
  if (kind === 'unknown') return false;
  return true;
}

export function isImagePath(filePath: string): boolean {
  return getFileKind(filePath) === 'image';
}

export function isArchivePath(filePath: string): boolean {
  const ext = getExtension(filePath);
  return ext === 'zip';
}

/**
 * Heuristic binary sniff used after decoding.
 * A NUL byte or a high ratio of replacement characters means we did not get text.
 */
export function looksBinary(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 4096);
  if (sample.includes('\u0000')) return true;
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0xfffd) bad++;
    else if (code < 9 || (code > 13 && code < 32)) bad++;
  }
  return bad / sample.length > 0.08;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function countLines(text: string): number {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** Per-file ceiling for text we keep in memory (2 MB). Larger files are truncated, never silently. */
export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

/** Total ceiling for a single imported project (40 MB of decoded text). */
export const MAX_PROJECT_TEXT_BYTES = 40 * 1024 * 1024;

/** The accept attribute for the attachment file input. */
export const ACCEPTED_UPLOAD_TYPES = [
  'image/*',
  '.zip',
  '.pdf', '.docx',
  '.txt', '.md', '.mdx', '.rst',
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.xml', '.csv', '.tsv',
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.dart',
  '.c', '.h', '.cpp', '.cc', '.hpp', '.cs', '.php', '.lua',
  '.sql', '.sh', '.bash', '.zsh', '.ps1',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.vue', '.svelte', '.prisma', '.graphql', '.gql',
].join(',');

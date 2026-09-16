import type {
  FileSymbols,
  IndexedFile,
  PackageManager,
  ProjectDependency,
  ProjectIndex,
  ProjectManifest,
  UnreadableReason,
} from '@/types/project';
import { countLines, getBaseName, getExtension, getFileKind, inferLanguage } from '@/lib/fs/fileTypes';
import { normalizeRelativePath } from '@/lib/zip';

/**
 * Builds a structured understanding of a project from its files:
 * symbols, an import graph, and a manifest describing stack/entry points/deps.
 *
 * Everything is derived from file *contents* that were actually decoded.
 * Files that could not be read are recorded as unreadable, never guessed at.
 */

export interface RawProjectFile {
  path: string;
  /** null when the file could not be decoded. */
  content: string | null;
  bytes: number;
  unreadableReason?: UnreadableReason;
  unreadableDetail?: string;
}

/* ------------------------------------------------------------------ */
/* Symbol extraction                                                   */
/* ------------------------------------------------------------------ */

const JS_IMPORT_RE =
  /(?:^|\n)\s*(?:import\s+(?:type\s+)?(?:[\w*\s{},$]+\s+from\s+)?|export\s+(?:type\s+)?(?:[\w*\s{},$]+\s+)?from\s+)['"]([^'"]+)['"]/g;
const JS_REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const JS_DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const CSS_IMPORT_RE = /@import\s+(?:url\(\s*['"]?([^'")]+)['"]?\s*\)|['"]([^'"]+)['"])/g;
const PY_IMPORT_RE = /(?:^|\n)\s*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/g;

const JS_EXPORT_RE =
  /(?:^|\n)\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const JS_DEFAULT_EXPORT_RE = /(?:^|\n)\s*export\s+default\s+(?:async\s+)?function\s*([A-Za-z_$][\w$]*)?/g;
const JS_DEFINITION_RE =
  /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g;
const PY_DEFINITION_RE = /(?:^|\n)\s*(?:async\s+)?(?:def|class)\s+([A-Za-z_][\w]*)/g;
const GO_DEFINITION_RE = /(?:^|\n)\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/g;

function collect(regex: RegExp, text: string, groups: number[] = [1]): string[] {
  const found = new Set<string>();
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    for (const g of groups) {
      const value = match[g];
      if (value) found.add(value);
    }
  }
  return Array.from(found);
}

export function extractSymbols(filePath: string, content: string): FileSymbols {
  const ext = getExtension(filePath);
  const empty: FileSymbols = { imports: [], exports: [], definitions: [] };
  if (!content) return empty;

  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'vue', 'svelte'].includes(ext)) {
    const imports = [
      ...collect(JS_IMPORT_RE, content),
      ...collect(JS_REQUIRE_RE, content),
      ...collect(JS_DYNAMIC_IMPORT_RE, content),
    ];
    const exports = [...collect(JS_EXPORT_RE, content), ...collect(JS_DEFAULT_EXPORT_RE, content)];
    const definitions = collect(JS_DEFINITION_RE, content, [1, 2, 3]);
    return {
      imports: Array.from(new Set(imports)),
      exports: Array.from(new Set(exports)),
      definitions: Array.from(new Set(definitions)).slice(0, 80),
    };
  }

  if (['css', 'scss', 'sass', 'less'].includes(ext)) {
    return { ...empty, imports: collect(CSS_IMPORT_RE, content, [1, 2]) };
  }

  if (ext === 'py') {
    return {
      imports: collect(PY_IMPORT_RE, content, [1, 2]),
      exports: [],
      definitions: collect(PY_DEFINITION_RE, content).slice(0, 80),
    };
  }

  if (ext === 'go') {
    return { imports: [], exports: [], definitions: collect(GO_DEFINITION_RE, content).slice(0, 80) };
  }

  return empty;
}

/* ------------------------------------------------------------------ */
/* Import resolution                                                   */
/* ------------------------------------------------------------------ */

const MODULE_SUFFIXES = [
  '',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.css', '.scss', '.json', '.vue', '.svelte',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
];

function resolveRelative(fromPath: string, specifier: string): string {
  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const parts = dir ? dir.split('/') : [];
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

/**
 * Resolves an import specifier to a real project path.
 * Handles relative paths and the common `@/` alias (tsconfig `paths`).
 * Returns null for bare package specifiers (they are dependencies, not files).
 */
export function resolveImport(
  fromPath: string,
  specifier: string,
  pathSet: Set<string>,
  aliasRoots: string[]
): string | null {
  let base: string | null = null;

  if (specifier.startsWith('.')) {
    base = resolveRelative(fromPath, specifier);
  } else if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
    base = specifier.slice(2);
  } else if (specifier.startsWith('/')) {
    base = specifier.slice(1);
  } else {
    return null;
  }

  const candidates = [base, ...aliasRoots.map((root) => `${root}/${base}`)];
  for (const candidate of candidates) {
    for (const suffix of MODULE_SUFFIXES) {
      const full = `${candidate}${suffix}`;
      if (pathSet.has(full)) return full;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Manifest detection                                                  */
/* ------------------------------------------------------------------ */

const LOCKFILE_MANAGERS: Array<[string, PackageManager]> = [
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['requirements.txt', 'pip'],
  ['pyproject.toml', 'pip'],
  ['Pipfile', 'pip'],
  ['Cargo.toml', 'cargo'],
  ['go.mod', 'go'],
  ['composer.json', 'composer'],
];

const ENTRY_POINT_PATTERNS = [
  /^app\/page\.(tsx|jsx|js|ts)$/,
  /^src\/app\/page\.(tsx|jsx|js|ts)$/,
  /^pages\/index\.(tsx|jsx|js|ts)$/,
  /^src\/pages\/index\.(tsx|jsx|js|ts)$/,
  /^src\/main\.(tsx|ts|jsx|js)$/,
  /^src\/index\.(tsx|ts|jsx|js)$/,
  /^index\.html$/,
  /^main\.(py|go|rs)$/,
  /^app\.(py|js|ts)$/,
  /^src\/main\.(py|go|rs)$/,
  /^cmd\/.*\/main\.go$/,
  /^manage\.py$/,
  /^server\.(js|ts)$/,
];

const CONFIG_PATTERNS = [
  /^package\.json$/,
  /^tsconfig.*\.json$/,
  /^jsconfig\.json$/,
  /^next\.config\.(ts|js|mjs)$/,
  /^vite\.config\.(ts|js)$/,
  /^tailwind\.config\.(ts|js)$/,
  /^postcss\.config\.(mjs|js|cjs)$/,
  /^eslint\.config\.(mjs|js|cjs)$/,
  /^\.eslintrc(\..+)?$/,
  /^vercel\.json$/,
  /^Dockerfile$/,
  /^docker-compose\.ya?ml$/,
  /^requirements\.txt$/,
  /^pyproject\.toml$/,
  /^Cargo\.toml$/,
  /^go\.mod$/,
  /^composer\.json$/,
  /^\.env\.example$/,
  /^prisma\/schema\.prisma$/,
];

const DOC_PATTERNS = [/^readme(\..+)?$/i, /^license(\..+)?$/i, /^changelog(\..+)?$/i, /^contributing(\..+)?$/i];

const ENV_VAR_RE = /process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]|os\.environ(?:\.get\(|\[)['"]([A-Z0-9_]+)['"]/g;

interface PackageJsonShape {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  packageManager?: string;
}

function detectStack(
  pkg: PackageJsonShape | null,
  pathSet: Set<string>
): string[] {
  const stack: string[] = [];
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

  if (has('next')) stack.push('Next.js');
  else if (has('nuxt')) stack.push('Nuxt');
  else if (has('@remix-run/react')) stack.push('Remix');
  else if (has('astro')) stack.push('Astro');
  else if (has('vite')) stack.push('Vite');

  if (has('react')) stack.push('React');
  if (has('vue')) stack.push('Vue');
  if (has('svelte')) stack.push('Svelte');
  if (has('tailwindcss')) stack.push('Tailwind CSS');
  if (has('typescript') || pathSet.has('tsconfig.json')) stack.push('TypeScript');
  if (has('express')) stack.push('Express');
  if (has('fastify')) stack.push('Fastify');
  if (has('nestjs') || has('@nestjs/core')) stack.push('NestJS');
  if (has('prisma') || has('@prisma/client')) stack.push('Prisma');
  if (has('drizzle-orm')) stack.push('Drizzle ORM');
  if (has('jest')) stack.push('Jest');
  if (has('vitest')) stack.push('Vitest');
  if (has('playwright') || has('@playwright/test')) stack.push('Playwright');

  if (pathSet.has('requirements.txt') || pathSet.has('pyproject.toml')) stack.push('Python');
  if (pathSet.has('go.mod')) stack.push('Go');
  if (pathSet.has('Cargo.toml')) stack.push('Rust');
  if (pathSet.has('composer.json')) stack.push('PHP');
  if (pathSet.has('Dockerfile')) stack.push('Docker');

  return Array.from(new Set(stack));
}

function parseRequirementsTxt(content: string): ProjectDependency[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('-'))
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9_.\-[\]]+)\s*([=<>~!].*)?$/);
      return match ? { name: match[1], version: (match[2] || '*').trim(), dev: false } : null;
    })
    .filter((d): d is ProjectDependency => d !== null);
}

/* ------------------------------------------------------------------ */
/* Index builder                                                       */
/* ------------------------------------------------------------------ */

export function buildProjectIndex(rawFiles: RawProjectFile[], projectName: string): ProjectIndex {
  const files: IndexedFile[] = [];
  const pathSet = new Set<string>();
  const directories = new Set<string>();
  const excludedPaths: string[] = [];

  for (const raw of rawFiles) {
    const path = normalizeRelativePath(raw.path);
    if (!path) continue;
    pathSet.add(path);
    const segments = path.split('/');
    for (let i = 1; i < segments.length; i++) directories.add(segments.slice(0, i).join('/'));
  }

  // tsconfig `baseUrl` style alias roots, so `@/lib/x` resolves in src-based layouts.
  const aliasRoots = ['', 'src', 'app'].filter((root) => root === '' || directories.has(root));

  for (const raw of rawFiles) {
    const path = normalizeRelativePath(raw.path);
    if (!path) continue;

    const content = raw.content;
    const symbols = content ? extractSymbols(path, content) : { imports: [], exports: [], definitions: [] };

    files.push({
      path,
      name: getBaseName(path),
      ext: getExtension(path),
      kind: getFileKind(path),
      language: inferLanguage(path),
      bytes: raw.bytes,
      lineCount: content ? countLines(content) : 0,
      content,
      unreadableReason: raw.unreadableReason,
      unreadableDetail: raw.unreadableDetail,
      symbols,
      dependsOn: [],
      dependedOnBy: [],
    });
  }

  // Resolve the import graph now that every path is known.
  const byPath: Record<string, number> = {};
  files.forEach((file, i) => {
    byPath[file.path] = i;
  });

  for (const file of files) {
    const resolved = new Set<string>();
    for (const specifier of file.symbols.imports) {
      const target = resolveImport(file.path, specifier, pathSet, aliasRoots);
      if (target && target !== file.path) resolved.add(target);
    }
    file.dependsOn = Array.from(resolved);
  }
  for (const file of files) {
    for (const target of file.dependsOn) {
      const idx = byPath[target];
      if (idx !== undefined) files[idx].dependedOnBy.push(file.path);
    }
  }

  /* --- manifest --- */

  let pkg: PackageJsonShape | null = null;
  const pkgFile = files.find((f) => f.path === 'package.json' && f.content);
  if (pkgFile?.content) {
    try {
      pkg = JSON.parse(pkgFile.content) as PackageJsonShape;
    } catch {
      pkg = null;
    }
  }

  const dependencies: ProjectDependency[] = [];
  if (pkg) {
    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
      dependencies.push({ name, version: String(version), dev: false });
    }
    for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
      dependencies.push({ name, version: String(version), dev: true });
    }
  }
  const reqFile = files.find((f) => f.path === 'requirements.txt' && f.content);
  if (reqFile?.content) dependencies.push(...parseRequirementsTxt(reqFile.content));

  const packageManagers: PackageManager[] = [];
  for (const [lockfile, manager] of LOCKFILE_MANAGERS) {
    if (pathSet.has(lockfile) && !packageManagers.includes(manager)) packageManagers.push(manager);
  }
  if (pkg?.packageManager) {
    const declared = pkg.packageManager.split('@')[0] as PackageManager;
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(declared) && !packageManagers.includes(declared)) {
      packageManagers.unshift(declared);
    }
  }
  if (packageManagers.length === 0 && pathSet.has('package.json')) packageManagers.push('npm');

  const entryPoints = files
    .filter((f) => ENTRY_POINT_PATTERNS.some((re) => re.test(f.path)))
    .map((f) => f.path);

  const configs = files.filter((f) => CONFIG_PATTERNS.some((re) => re.test(f.path))).map((f) => f.path);

  const documentation = files
    .filter((f) => DOC_PATTERNS.some((re) => re.test(f.name)) || f.path.startsWith('docs/'))
    .map((f) => f.path);

  const envVars = new Set<string>();
  for (const file of files) {
    if (!file.content) continue;
    ENV_VAR_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ENV_VAR_RE.exec(file.content)) !== null) {
      const name = match[1] || match[2] || match[3];
      if (name) envVars.add(name);
    }
    if (file.name.startsWith('.env')) {
      for (const line of file.content.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
        if (m) envVars.add(m[1]);
      }
    }
  }

  const readableCount = files.filter((f) => f.content !== null).length;
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);

  const manifest: ProjectManifest = {
    name: pkg?.name || projectName,
    fileCount: files.length,
    totalBytes,
    readableCount,
    unreadableCount: files.length - readableCount,
    directories: Array.from(directories).sort(),
    stack: detectStack(pkg, pathSet),
    packageManagers,
    dependencies,
    entryPoints,
    configs,
    documentation,
    envVars: Array.from(envVars).sort(),
    excludedPaths,
    scripts: pkg?.scripts || {},
    builtAt: Date.now(),
  };

  return { manifest, files, byPath };
}

/** Renders the manifest as compact text for the model's system context. */
export function formatManifestForModel(manifest: ProjectManifest): string {
  const lines: string[] = [];
  lines.push(`PROJECT: ${manifest.name}`);
  lines.push(
    `Files: ${manifest.fileCount} (${manifest.readableCount} readable, ${manifest.unreadableCount} binary/unreadable) — ${(manifest.totalBytes / 1024).toFixed(0)} KB`
  );
  if (manifest.stack.length) lines.push(`Stack: ${manifest.stack.join(', ')}`);
  if (manifest.packageManagers.length) lines.push(`Package manager: ${manifest.packageManagers.join(', ')}`);
  if (manifest.entryPoints.length) lines.push(`Entry points: ${manifest.entryPoints.join(', ')}`);
  if (manifest.configs.length) lines.push(`Config files: ${manifest.configs.join(', ')}`);
  if (manifest.documentation.length) lines.push(`Docs: ${manifest.documentation.join(', ')}`);

  if (manifest.dependencies.length) {
    const runtime = manifest.dependencies.filter((d) => !d.dev).slice(0, 40);
    const dev = manifest.dependencies.filter((d) => d.dev).slice(0, 25);
    if (runtime.length) lines.push(`Dependencies: ${runtime.map((d) => `${d.name}@${d.version}`).join(', ')}`);
    if (dev.length) lines.push(`Dev dependencies: ${dev.map((d) => d.name).join(', ')}`);
  }

  const scriptEntries = Object.entries(manifest.scripts);
  if (scriptEntries.length) {
    lines.push(`Scripts: ${scriptEntries.map(([k, v]) => `${k}="${v}"`).join(', ')}`);
  }
  if (manifest.envVars.length) {
    lines.push(`Environment variables referenced: ${manifest.envVars.join(', ')}`);
  }

  return lines.join('\n');
}

/** A compact directory listing with per-file metadata, used in the system prompt. */
export function formatFileTreeForModel(index: ProjectIndex, maxFiles = 400): string {
  const lines: string[] = [];
  const files = index.files.slice(0, maxFiles);
  for (const file of files) {
    const meta: string[] = [`${file.lineCount} lines`];
    if (file.content === null) meta.push(`UNREADABLE: ${file.unreadableReason}`);
    if (file.dependedOnBy.length) meta.push(`imported by ${file.dependedOnBy.length}`);
    lines.push(`${file.path} (${meta.join(', ')})`);
  }
  if (index.files.length > maxFiles) {
    lines.push(`... and ${index.files.length - maxFiles} more files (use list_files to enumerate)`);
  }
  return lines.join('\n');
}

import { ArtifactProject } from '@/types/artifact';
import { normalizeRelativePath, isSafeExportPath } from '@/lib/zip';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  filePath?: string;
  message: string;
  detail?: string;
  line?: number;
}

export interface ProjectValidationResult {
  isValid: boolean;
  hasErrors: boolean;
  summary: string;
  timestamp: number;
  issues: ValidationIssue[];
  stats: {
    totalFiles: number;
    filesChecked: number;
    importsChecked: number;
    jsonFilesChecked: number;
    issuesCount: number;
  };
}

/**
 * Resolves a relative import path (e.g. "./Navbar" or "../components/Hero")
 * against a source file's directory path.
 */
function resolveRelativeImport(
  sourceFilePath: string,
  importPath: string
): string {
  const sourceDir = sourceFilePath.includes('/')
    ? sourceFilePath.substring(0, sourceFilePath.lastIndexOf('/'))
    : '';

  const parts = sourceDir ? sourceDir.split('/') : [];
  const segments = importPath.split('/');

  for (const seg of segments) {
    if (seg === '.' || seg === '') {
      continue;
    } else if (seg === '..') {
      if (parts.length > 0) {
        parts.pop();
      }
    } else {
      parts.push(seg);
    }
  }

  return parts.join('/');
}

/**
 * Checks if a resolved path matches any file in the project,
 * trying common module extensions (.tsx, .ts, .jsx, .js, /index.ts, /index.tsx, .css).
 */
function fileExistsInProject(
  resolvedPath: string,
  normalizedFilePaths: Set<string>
): boolean {
  if (normalizedFilePaths.has(resolvedPath)) return true;

  const candidateExtensions = [
    '.tsx',
    '.ts',
    '.jsx',
    '.js',
    '.css',
    '.json',
    '/index.tsx',
    '/index.ts',
    '/index.jsx',
    '/index.js',
  ];

  for (const ext of candidateExtensions) {
    if (normalizedFilePaths.has(`${resolvedPath}${ext}`)) return true;
  }

  return false;
}

/**
 * Performs comprehensive static validation on an ArtifactProject.
 * Does NOT invoke any arbitrary or dangerous shell commands.
 */
export function validateProject(project: ArtifactProject): ProjectValidationResult {
  const issues: ValidationIssue[] = [];
  const files = project.files || [];
  const normalizedFilePaths = new Set<string>();
  const pathMap = new Map<string, string>(); // lowerCase -> original path for collision detection

  let importsChecked = 0;
  let jsonFilesChecked = 0;

  // 1. Path Safety & Duplicate Path Detection
  for (const file of files) {
    const rawPath = file.path;
    const normalized = normalizeRelativePath(rawPath);

    if (!isSafeExportPath(normalized)) {
      issues.push({
        id: `unsafe-path-${normalized}`,
        severity: 'error',
        filePath: rawPath,
        message: `Unsafe or forbidden file path: "${rawPath}"`,
        detail: 'Path contains directory traversal, forbidden characters, or sensitive blacklisted filename.',
      });
    }

    const lower = normalized.toLowerCase();
    if (pathMap.has(lower)) {
      issues.push({
        id: `dup-path-${lower}`,
        severity: 'error',
        filePath: normalized,
        message: `Duplicate file path collision: "${normalized}" collides with "${pathMap.get(lower)}"`,
        detail: 'File paths must be unique (case-insensitive) to prevent overwrite anomalies on case-insensitive filesystems.',
      });
    } else {
      pathMap.set(lower, normalized);
    }

    normalizedFilePaths.add(normalized);
  }

  // 2. JSON Syntax Validation
  for (const file of files) {
    const norm = normalizeRelativePath(file.path);
    if (norm.endsWith('.json')) {
      jsonFilesChecked++;
      try {
        const parsed = JSON.parse(file.content);
        if (norm === 'package.json') {
          if (typeof parsed !== 'object' || parsed === null) {
            issues.push({
              id: 'pkg-json-invalid',
              severity: 'error',
              filePath: norm,
              message: 'package.json must be a valid JSON object.',
            });
          }
        }
      } catch (err) {
        issues.push({
          id: `json-syntax-${norm}`,
          severity: 'error',
          filePath: norm,
          message: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Parse error'}`,
          detail: 'Fix formatting errors such as trailing commas, single quotes, or missing brackets.',
        });
      }
    }
  }

  // 3. Import Resolution & Cross-File References
  const importRegex = /(?:import\s+(?:[\w*\s{},]+from\s+)?['"]([^'"]+)['"]|export\s+(?:[\w*\s{},]+from\s+)['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  const cssImportRegex = /@import\s+(?:url\(['"]?([^'")]+)['"]?\)|['"]([^'"]+)['"])/g;

  for (const file of files) {
    const norm = normalizeRelativePath(file.path);
    const content = file.content || '';
    const isCode = /\.(tsx?|jsx?|mjs|cjs)$/i.test(norm);
    const isCss = /\.(css|scss)$/i.test(norm);

    if (isCode) {
      const lines = content.split('\n');
      lines.forEach((lineText, lineIdx) => {
        let match: RegExpExecArray | null;
        importRegex.lastIndex = 0;

        while ((match = importRegex.exec(lineText)) !== null) {
          const rawImport = match[1] || match[2] || match[3];
          if (!rawImport) continue;

          // Only check relative imports (e.g. starts with ./ or ../ or /)
          if (rawImport.startsWith('.')) {
            importsChecked++;
            const resolved = resolveRelativeImport(norm, rawImport);
            if (!fileExistsInProject(resolved, normalizedFilePaths)) {
              issues.push({
                id: `missing-import-${norm}-${lineIdx + 1}`,
                severity: 'error',
                filePath: norm,
                line: lineIdx + 1,
                message: `Cannot resolve relative import: "${rawImport}"`,
                detail: `Target module "${resolved}" does not exist in the project artifact.`,
              });
            }
          }
        }
      });
    }

    if (isCss) {
      let match: RegExpExecArray | null;
      cssImportRegex.lastIndex = 0;
      while ((match = cssImportRegex.exec(content)) !== null) {
        const rawImport = match[1] || match[2];
        if (rawImport && rawImport.startsWith('.')) {
          importsChecked++;
          const resolved = resolveRelativeImport(norm, rawImport);
          if (!fileExistsInProject(resolved, normalizedFilePaths)) {
            issues.push({
              id: `missing-css-import-${norm}`,
              severity: 'warning',
              filePath: norm,
              message: `Cannot resolve CSS import: "${rawImport}"`,
              detail: `Referenced stylesheet "${resolved}" was not found in project files.`,
            });
          }
        }
      }
    }
  }

  // 4. Project Completeness & Structural Checks
  const hasAppPage = normalizedFilePaths.has('app/page.tsx') || normalizedFilePaths.has('app/page.jsx') || normalizedFilePaths.has('app/page.js');
  const hasAppLayout = normalizedFilePaths.has('app/layout.tsx') || normalizedFilePaths.has('app/layout.jsx') || normalizedFilePaths.has('app/layout.js');
  const hasIndexHtml = normalizedFilePaths.has('index.html');
  const hasPackageJson = normalizedFilePaths.has('package.json');

  if (hasAppPage && !hasAppLayout) {
    issues.push({
      id: 'missing-app-layout',
      severity: 'error',
      message: 'Missing root layout: Next.js App Router requires "app/layout.tsx".',
      detail: 'Create an "app/layout.tsx" export default RootLayout component to wrap pages.',
    });
  }

  if (hasAppPage && !hasPackageJson) {
    issues.push({
      id: 'missing-package-json',
      severity: 'warning',
      message: 'Missing "package.json" in Next.js project.',
      detail: 'Next.js projects require package.json to define dependencies (next, react, react-dom).',
    });
  }

  if (files.length === 0) {
    issues.push({
      id: 'empty-project',
      severity: 'warning',
      message: 'The project currently contains no files.',
    });
  } else if (!hasIndexHtml && !hasAppPage && !Array.from(normalizedFilePaths).some((p) => p.endsWith('.py') || p.endsWith('.go') || p.endsWith('.rs'))) {
    issues.push({
      id: 'no-entrypoint',
      severity: 'info',
      message: 'No standard web or script entry point identified (e.g. index.html, app/page.tsx, main.py).',
    });
  }

  const errorsCount = issues.filter((i) => i.severity === 'error').length;
  const warningsCount = issues.filter((i) => i.severity === 'warning').length;
  const hasErrors = errorsCount > 0;
  const isValid = !hasErrors;

  let summary = `Static validation completed. ${files.length} files checked, ${importsChecked} import references verified.`;
  if (hasErrors) {
    summary += ` Found ${errorsCount} error(s) and ${warningsCount} warning(s).`;
  } else if (warningsCount > 0) {
    summary += ` All imports and JSON valid with ${warningsCount} warning(s).`;
  } else {
    summary += ` No broken imports or structural issues found. Project is healthy.`;
  }

  return {
    isValid,
    hasErrors,
    summary,
    timestamp: Date.now(),
    issues,
    stats: {
      totalFiles: files.length,
      filesChecked: files.length,
      importsChecked,
      jsonFilesChecked,
      issuesCount: issues.length,
    },
  };
}

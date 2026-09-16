import type {
  AppliedOperation,
  ArtifactFile,
  ArtifactOperation,
  ArtifactOperationType,
  ArtifactProject,
  FileTreeNode,
  ProjectTemplate,
} from '@/types/artifact';
import { normalizeRelativePath, isSafeExportPath } from './zip';
import { inferLanguage } from '@/lib/fs/fileTypes';
import { computeLineDiff } from './diff';

/** Kept as a named export for backwards compatibility with older imports. */
export function inferLanguageFromPath(filePath: string): string {
  return inferLanguage(filePath);
}

/* ------------------------------------------------------------------ */
/* Tag parsing                                                         */
/* ------------------------------------------------------------------ */

function getAttr(raw: string, name: string): string | undefined {
  const patterns = [
    new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'),
    new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'),
    new RegExp(`${name}\\s*=\\s*([^\\s"'>]+)`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(raw);
    if (match) return match[1].trim();
  }
  return undefined;
}

function trimBlock(content: string): string {
  return content.replace(/^\r?\n/, '').replace(/[ \t]*\r?\n$/, '');
}

const FILE_TAG_RE = /<file\s+([^>]*?)>([\s\S]*?)<\/file>/gi;
const ARTIFACT_BLOCK_RE = /<raizel_artifact\s+([^>]*?)>([\s\S]*?)<\/raizel_artifact>/i;
const OPERATION_RE = /<raizel_operation\s+([^>]*?)>([\s\S]*?)<\/raizel_operation>/gi;

/** Matches an artifact or operation tag that has opened but not yet closed. */
const UNCLOSED_TAG_RE = /<raizel_(?:artifact|operation|memory|request)\b[\s\S]*$/i;

function parseFileTags(source: string): ArtifactFile[] {
  const files: ArtifactFile[] = [];
  FILE_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FILE_TAG_RE.exec(source)) !== null) {
    const attrs = match[1];
    const rawPath = getAttr(attrs, 'path');
    if (!rawPath) continue;

    const path = normalizeRelativePath(rawPath);
    if (!isSafeExportPath(path)) continue;

    const language = getAttr(attrs, 'language') || getAttr(attrs, 'lang') || inferLanguage(path);
    files.push({
      path,
      name: path.split('/').pop() || path,
      content: trimBlock(match[2]),
      language,
      isReadable: true,
      updatedAt: Date.now(),
    });
  }

  return files;
}

/**
 * Progressive extraction while the response is still streaming.
 *
 * `lastLength` lets callers skip re-scanning text they already parsed, which
 * keeps streaming O(n) overall instead of O(n²) on long generations.
 */
export function extractStreamingFiles(streamText: string, fromIndex = 0): {
  files: ArtifactFile[];
  scannedTo: number;
} {
  // Only re-scan from the last complete tag boundary.
  const source = streamText.slice(fromIndex);
  const files = parseFileTags(source);

  const lastClose = source.lastIndexOf('</file>');
  const scannedTo = lastClose >= 0 ? fromIndex + lastClose + '</file>'.length : fromIndex;

  return { files, scannedTo };
}

export interface ParsedArtifactResponse {
  project?: {
    name: string;
    title: string;
    description?: string;
    files: ArtifactFile[];
  };
  operations: ArtifactOperation[];
  cleanText: string;
}

const VALID_OPERATIONS: ArtifactOperationType[] = [
  'create_file',
  'update_file',
  'delete_file',
  'rename_file',
];

export function parseArtifactFromResponse(text: string): ParsedArtifactResponse {
  const artifactMatch = text.match(ARTIFACT_BLOCK_RE);

  if (artifactMatch) {
    const attrs = artifactMatch[1];
    const name = getAttr(attrs, 'project') || getAttr(attrs, 'name') || 'project';
    const title = getAttr(attrs, 'title') || name;
    const description = getAttr(attrs, 'description');
    const files = parseFileTags(artifactMatch[2]);

    return {
      project: { name, title, description, files },
      operations: [],
      cleanText: stripArtifactMarkup(text),
    };
  }

  const operations: ArtifactOperation[] = [];
  OPERATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = OPERATION_RE.exec(text)) !== null) {
    const attrs = match[1];
    const operation = getAttr(attrs, 'operation') as ArtifactOperationType | undefined;
    const rawPath = getAttr(attrs, 'path');
    if (!operation || !VALID_OPERATIONS.includes(operation) || !rawPath) continue;

    const path = normalizeRelativePath(rawPath);
    if (!isSafeExportPath(path)) continue;

    const rawNewPath = getAttr(attrs, 'newPath') || getAttr(attrs, 'new_path');
    const newPath = rawNewPath ? normalizeRelativePath(rawNewPath) : undefined;

    operations.push({
      operation,
      path,
      newPath,
      content: trimBlock(match[2] || ''),
      language: inferLanguage(newPath || path),
      reason: getAttr(attrs, 'reason'),
    });
  }

  return { operations, cleanText: stripArtifactMarkup(text) };
}

/** Removes workspace markup so the chat bubble shows prose only. */
export function stripArtifactMarkup(text: string): string {
  return text
    .replace(ARTIFACT_BLOCK_RE, '')
    .replace(OPERATION_RE, '')
    .replace(UNCLOSED_TAG_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** True when the text contains workspace markup (complete or still streaming). */
export function containsArtifactMarkup(text: string): boolean {
  return /<raizel_(?:artifact|operation)\b/i.test(text);
}

/* ------------------------------------------------------------------ */
/* File tree                                                           */
/* ------------------------------------------------------------------ */

export function buildFileTree(files: ArtifactFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const path = normalizeRelativePath(file.path);
    if (!path) continue;
    const segments = path.split('/');
    let level = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isFile = i === segments.length - 1;
      const currentPath = segments.slice(0, i + 1).join('/');

      let node = level.find((n) => n.name === segment && n.isDirectory === !isFile);

      if (!node) {
        node = isFile
          ? {
              name: segment,
              path: currentPath,
              isDirectory: false,
              language: file.language,
              isModified: file.isModified,
              isReadable: file.isReadable !== false,
            }
          : { name: segment, path: currentPath, isDirectory: true, children: [] };
        level.push(node);
      }

      if (!isFile && node.children) level = node.children;
    }
  }

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] =>
    nodes
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => ({ ...node, children: node.children ? sortNodes(node.children) : undefined }));

  return sortNodes(root);
}

/* ------------------------------------------------------------------ */
/* Applying operations                                                 */
/* ------------------------------------------------------------------ */

export interface ApplyResult {
  project: ArtifactProject;
  applied: AppliedOperation[];
}

function countDiff(before: string, after: string): { addedLines: number; removedLines: number } {
  if (before === after) return { addedLines: 0, removedLines: 0 };
  // Cheap path for very large files; the exact diff is computed lazily in the UI.
  if (before.length + after.length > 400_000) {
    const beforeLines = before ? before.split('\n').length : 0;
    const afterLines = after ? after.split('\n').length : 0;
    return {
      addedLines: Math.max(0, afterLines - beforeLines),
      removedLines: Math.max(0, beforeLines - afterLines),
    };
  }
  const diff = computeLineDiff(before, after);
  return { addedLines: diff.additions, removedLines: diff.deletions };
}

/**
 * Applies operations and reports exactly what happened to each one, including
 * the ones that were rejected and why. Callers render this rather than
 * assuming success.
 */
export function applyArtifactOperations(
  project: ArtifactProject,
  operations: ArtifactOperation[]
): ApplyResult {
  let files = [...project.files];
  let activePath = project.activeFilePath;
  const applied: AppliedOperation[] = [];

  const indexOf = (path: string) =>
    files.findIndex((f) => normalizeRelativePath(f.path) === path);

  for (const op of operations) {
    const path = normalizeRelativePath(op.path);

    if (!isSafeExportPath(path)) {
      applied.push({
        operation: op.operation,
        path: op.path,
        status: 'skipped',
        skipReason: 'path is unsafe or on the credential blocklist',
        addedLines: 0,
        removedLines: 0,
        reason: op.reason,
      });
      continue;
    }

    if (op.operation === 'create_file' || op.operation === 'update_file') {
      const existingIdx = indexOf(path);
      const content = op.content ?? '';
      const before = existingIdx >= 0 ? files[existingIdx].content : '';

      if (existingIdx >= 0 && before === content) {
        applied.push({
          operation: op.operation,
          path,
          status: 'skipped',
          skipReason: 'file content is unchanged',
          addedLines: 0,
          removedLines: 0,
          reason: op.reason,
        });
        continue;
      }

      const language = op.language || inferLanguage(path);
      const name = path.split('/').pop() || path;
      const next: ArtifactFile = {
        path,
        name,
        content,
        language,
        previousContent: existingIdx >= 0 ? before : undefined,
        isModified: true,
        isReadable: true,
        updatedAt: Date.now(),
      };

      if (existingIdx >= 0) files[existingIdx] = next;
      else files.push(next);

      applied.push({
        operation: existingIdx >= 0 ? 'update_file' : 'create_file',
        path,
        status: 'applied',
        reason: op.reason,
        ...countDiff(before, content),
      });
      continue;
    }

    if (op.operation === 'delete_file') {
      const existingIdx = indexOf(path);
      if (existingIdx < 0) {
        applied.push({
          operation: 'delete_file',
          path,
          status: 'skipped',
          skipReason: 'file does not exist',
          addedLines: 0,
          removedLines: 0,
          reason: op.reason,
        });
        continue;
      }
      const removed = files[existingIdx].content;
      files = files.filter((_, i) => i !== existingIdx);
      if (normalizeRelativePath(activePath) === path) activePath = files[0]?.path || '';
      applied.push({
        operation: 'delete_file',
        path,
        status: 'applied',
        addedLines: 0,
        removedLines: removed ? removed.split('\n').length : 0,
        reason: op.reason,
      });
      continue;
    }

    if (op.operation === 'rename_file') {
      const newPath = op.newPath ? normalizeRelativePath(op.newPath) : '';
      const existingIdx = indexOf(path);

      if (!newPath || !isSafeExportPath(newPath)) {
        applied.push({
          operation: 'rename_file',
          path,
          newPath: op.newPath,
          status: 'skipped',
          skipReason: 'destination path is missing or unsafe',
          addedLines: 0,
          removedLines: 0,
          reason: op.reason,
        });
        continue;
      }
      if (existingIdx < 0) {
        applied.push({
          operation: 'rename_file',
          path,
          newPath,
          status: 'skipped',
          skipReason: 'source file does not exist',
          addedLines: 0,
          removedLines: 0,
          reason: op.reason,
        });
        continue;
      }

      const source = files[existingIdx];
      const content = op.content && op.content.length > 0 ? op.content : source.content;
      files[existingIdx] = {
        ...source,
        path: newPath,
        name: newPath.split('/').pop() || newPath,
        content,
        previousContent: source.content !== content ? source.content : source.previousContent,
        language: inferLanguage(newPath),
        isModified: true,
        updatedAt: Date.now(),
      };
      if (normalizeRelativePath(activePath) === path) activePath = newPath;

      applied.push({
        operation: 'rename_file',
        path,
        newPath,
        status: 'applied',
        reason: op.reason,
        ...countDiff(source.content, content),
      });
    }
  }

  if (!files.some((f) => normalizeRelativePath(f.path) === normalizeRelativePath(activePath))) {
    activePath = files[0]?.path || '';
  }

  const changedCount = applied.filter((a) => a.status === 'applied').length;

  return {
    project: {
      ...project,
      files,
      activeFilePath: activePath,
      updatedAt: Date.now(),
      version: changedCount > 0 ? (project.version || 1) + 1 : project.version || 1,
      lastChanges: applied,
    },
    applied,
  };
}

/** Clears the per-session modification flags, e.g. after the user reviews changes. */
export function acknowledgeChanges(project: ArtifactProject): ArtifactProject {
  return {
    ...project,
    files: project.files.map((f) => ({ ...f, isModified: false })),
    lastChanges: [],
  };
}

/* ------------------------------------------------------------------ */
/* Starter templates                                                   */
/* ------------------------------------------------------------------ */

const now = () => Date.now();

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'static-landing',
    name: 'Static landing page',
    category: 'web',
    description: 'Single-file HTML page with modern CSS. No build step required.',
    project: {
      name: 'landing-page',
      title: 'Static landing page',
      description: 'A dependency-free HTML/CSS starting point.',
      activeFilePath: 'index.html',
      files: [
        {
          path: 'index.html',
          name: 'index.html',
          language: 'html',
          isReadable: true,
          updatedAt: now(),
          content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Product</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="logo" href="/">Product</a>
      <nav>
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
      </nav>
    </header>

    <main>
      <section class="hero">
        <h1>A clear headline about what this does</h1>
        <p>One sentence explaining the value, written for the person who has to decide in five seconds.</p>
        <a class="button" href="#pricing">Get started</a>
      </section>
    </main>

    <footer class="site-footer">
      <p>&copy; 2026 Product</p>
    </footer>
  </body>
</html>
`,
        },
        {
          path: 'styles.css',
          name: 'styles.css',
          language: 'css',
          isReadable: true,
          updatedAt: now(),
          content: `:root {
  --text: #18181b;
  --muted: #71717a;
  --line: #e4e4e7;
  --accent: #18181b;
  --max-width: 64rem;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--text);
  line-height: 1.6;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--line);
}

.logo { font-weight: 600; text-decoration: none; color: inherit; }
nav { display: flex; gap: 1.5rem; }
nav a { color: var(--muted); text-decoration: none; font-size: 0.9375rem; }
nav a:hover { color: var(--text); }

.hero {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 6rem 1.5rem;
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 3.25rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 0 0 1rem;
  max-width: 24ch;
}

.hero p { color: var(--muted); font-size: 1.125rem; max-width: 52ch; margin: 0 0 2rem; }

.button {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background: var(--accent);
  color: #fff;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.9375rem;
  font-weight: 500;
}

.site-footer {
  border-top: 1px solid var(--line);
  padding: 2rem 1.5rem;
  color: var(--muted);
  font-size: 0.875rem;
}

.site-footer p { max-width: var(--max-width); margin: 0 auto; }
`,
        },
      ],
    },
  },
  {
    id: 'python-cli',
    name: 'Python CLI tool',
    category: 'python',
    description: 'Argparse-based CLI with a tested entry point and requirements file.',
    project: {
      name: 'python-cli',
      title: 'Python CLI tool',
      description: 'Standard-library CLI scaffold.',
      activeFilePath: 'main.py',
      files: [
        {
          path: 'main.py',
          name: 'main.py',
          language: 'python',
          isReadable: true,
          updatedAt: now(),
          content: `#!/usr/bin/env python3
"""Command line entry point."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def count_lines(path: Path) -> int:
    """Returns the number of lines in a UTF-8 text file."""
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        return sum(1 for _ in handle)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Count lines in text files.")
    parser.add_argument("paths", nargs="+", type=Path, help="Files to inspect")
    parser.add_argument("--total", action="store_true", help="Print a grand total")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    total = 0
    for path in args.paths:
        if not path.is_file():
            print(f"skip: {path} is not a file", file=sys.stderr)
            continue
        lines = count_lines(path)
        total += lines
        print(f"{lines:>8}  {path}")

    if args.total:
        print(f"{total:>8}  total")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`,
        },
        {
          path: 'test_main.py',
          name: 'test_main.py',
          language: 'python',
          isReadable: true,
          updatedAt: now(),
          content: `from pathlib import Path

from main import count_lines


def test_count_lines(tmp_path: Path) -> None:
    sample = tmp_path / "sample.txt"
    sample.write_text("a\\nb\\nc\\n", encoding="utf-8")
    assert count_lines(sample) == 3
`,
        },
        {
          path: 'requirements.txt',
          name: 'requirements.txt',
          language: 'plaintext',
          isReadable: true,
          updatedAt: now(),
          content: `pytest>=8.0
`,
        },
        {
          path: 'README.md',
          name: 'README.md',
          language: 'markdown',
          isReadable: true,
          updatedAt: now(),
          content: `# Python CLI tool

## Usage

\`\`\`bash
python main.py file.txt another.txt --total
\`\`\`

## Tests

\`\`\`bash
pip install -r requirements.txt
pytest
\`\`\`
`,
        },
      ],
    },
  },
];

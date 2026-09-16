import type { ProjectIndex, ProjectToolCall, ProjectToolName, ProjectToolResult } from '@/types/project';
import { normalizeRelativePath } from '@/lib/zip';

/**
 * Lets the model pull more of the project on demand instead of us shipping the
 * whole repository every turn. The model emits:
 *
 *   <raizel_request tool="read_file" path="lib/auth.ts" />
 *   <raizel_request tool="search_in_project" query="createSession" />
 *
 * The client resolves these against the local index and sends the results back
 * as a follow-up turn. Nothing executes; this is pure read-only file access.
 */

const REQUEST_RE = /<raizel_request\b([^>]*?)(?:\/>|>([\s\S]*?)<\/raizel_request>)/gi;

const VALID_TOOLS: ProjectToolName[] = [
  'list_files',
  'read_file',
  'read_range',
  'read_multiple_files',
  'search_in_project',
];

function getAttr(raw: string, name: string): string | undefined {
  const patterns = [
    new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'),
    new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'),
    new RegExp(`${name}\\s*=\\s*([^\\s"'>/]+)`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(raw);
    if (match) return match[1].trim();
  }
  return undefined;
}

export function parseToolCalls(text: string): ProjectToolCall[] {
  const calls: ProjectToolCall[] = [];
  REQUEST_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = REQUEST_RE.exec(text)) !== null) {
    const attrs = match[1] || '';
    const tool = getAttr(attrs, 'tool') as ProjectToolName | undefined;
    if (!tool || !VALID_TOOLS.includes(tool)) continue;

    const pathAttr = getAttr(attrs, 'path');
    const pathsAttr = getAttr(attrs, 'paths');
    const query = getAttr(attrs, 'query') ?? match[2]?.trim();
    const start = getAttr(attrs, 'start') ?? getAttr(attrs, 'startLine');
    const end = getAttr(attrs, 'end') ?? getAttr(attrs, 'endLine');

    calls.push({
      tool,
      path: pathAttr ? normalizeRelativePath(pathAttr) : undefined,
      paths: pathsAttr
        ? pathsAttr.split(',').map((p) => normalizeRelativePath(p.trim())).filter(Boolean)
        : undefined,
      query: query || undefined,
      startLine: start ? Number(start) : undefined,
      endLine: end ? Number(end) : undefined,
      raw: match[0],
    });
  }

  // Cap per turn so a runaway model cannot loop the client.
  return calls.slice(0, 12);
}

export function stripToolCalls(text: string): string {
  return text.replace(REQUEST_RE, '').trim();
}

function numberLines(content: string, offset = 0): string {
  return content
    .split('\n')
    .map((line, i) => `${String(i + 1 + offset).padStart(5, ' ')}| ${line}`)
    .join('\n');
}

const MAX_TOOL_OUTPUT_CHARS = 40000;

function truncate(output: string): string {
  if (output.length <= MAX_TOOL_OUTPUT_CHARS) return output;
  return `${output.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n... [output truncated at ${MAX_TOOL_OUTPUT_CHARS} characters — narrow the request]`;
}

export function executeToolCall(index: ProjectIndex, call: ProjectToolCall): ProjectToolResult {
  const fileAt = (path: string) => {
    const i = index.byPath[path];
    return i === undefined ? undefined : index.files[i];
  };

  switch (call.tool) {
    case 'list_files': {
      const prefix = call.path || call.query || '';
      const matches = index.files.filter((f) => !prefix || f.path.startsWith(prefix));
      const lines = matches.map(
        (f) => `${f.path}  (${f.lineCount} lines, ${f.language}${f.content === null ? ', UNREADABLE' : ''})`
      );
      return {
        call,
        ok: true,
        output: truncate(`${matches.length} file(s)${prefix ? ` under "${prefix}"` : ''}:\n${lines.join('\n')}`),
      };
    }

    case 'read_file': {
      if (!call.path) return { call, ok: false, output: 'read_file requires a "path" attribute.' };
      const file = fileAt(call.path);
      if (!file) {
        const near = index.files
          .filter((f) => f.name === call.path?.split('/').pop())
          .map((f) => f.path)
          .slice(0, 5);
        return {
          call,
          ok: false,
          output: `No file at "${call.path}".${near.length ? ` Did you mean: ${near.join(', ')}?` : ''}`,
        };
      }
      if (file.content === null) {
        return {
          call,
          ok: false,
          output: `"${file.path}" could not be read (${file.unreadableReason}): ${file.unreadableDetail || 'no detail'}`,
        };
      }
      return {
        call,
        ok: true,
        output: truncate(`FILE ${file.path} (${file.lineCount} lines)\n${numberLines(file.content)}`),
      };
    }

    case 'read_range': {
      if (!call.path) return { call, ok: false, output: 'read_range requires a "path" attribute.' };
      const file = fileAt(call.path);
      if (!file || file.content === null) {
        return { call, ok: false, output: `"${call.path}" is not available as readable text.` };
      }
      const lines = file.content.split('\n');
      const start = Math.max(1, call.startLine || 1);
      const end = Math.min(lines.length, call.endLine || start + 200);
      const body = lines.slice(start - 1, end).join('\n');
      return {
        call,
        ok: true,
        output: truncate(
          `FILE ${file.path} lines ${start}-${end} of ${lines.length}\n${numberLines(body, start - 1)}`
        ),
      };
    }

    case 'read_multiple_files': {
      const paths = call.paths || (call.path ? [call.path] : []);
      if (paths.length === 0) {
        return { call, ok: false, output: 'read_multiple_files requires a comma-separated "paths" attribute.' };
      }
      const blocks: string[] = [];
      for (const path of paths.slice(0, 10)) {
        const file = fileAt(path);
        if (!file) blocks.push(`--- ${path}: NOT FOUND ---`);
        else if (file.content === null) blocks.push(`--- ${path}: UNREADABLE (${file.unreadableReason}) ---`);
        else blocks.push(`--- ${path} (${file.lineCount} lines) ---\n${file.content}`);
      }
      return { call, ok: true, output: truncate(blocks.join('\n\n')) };
    }

    case 'search_in_project': {
      const query = (call.query || '').trim();
      if (!query) return { call, ok: false, output: 'search_in_project requires a "query" attribute.' };

      const needle = query.toLowerCase();
      const hits: string[] = [];
      let matchCount = 0;

      for (const file of index.files) {
        if (file.content === null) continue;
        if (call.path && !file.path.startsWith(call.path)) continue;
        const lines = file.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            matchCount++;
            hits.push(`${file.path}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
            if (hits.length >= 200) break;
          }
        }
        if (hits.length >= 200) break;
      }

      if (matchCount === 0) {
        return { call, ok: true, output: `No matches for "${query}" in ${index.files.length} indexed files.` };
      }
      return {
        call,
        ok: true,
        output: truncate(`${matchCount} match(es) for "${query}":\n${hits.join('\n')}`),
      };
    }

    default:
      return { call, ok: false, output: `Unknown tool "${call.tool}".` };
  }
}

export function executeToolCalls(index: ProjectIndex, calls: ProjectToolCall[]): ProjectToolResult[] {
  return calls.map((call) => executeToolCall(index, call));
}

export function formatToolResults(results: ProjectToolResult[]): string {
  return results
    .map((r) => {
      const descriptor = [
        r.call.tool,
        r.call.path ? `path="${r.call.path}"` : '',
        r.call.paths ? `paths="${r.call.paths.join(',')}"` : '',
        r.call.query ? `query="${r.call.query}"` : '',
        r.call.startLine ? `start=${r.call.startLine}` : '',
        r.call.endLine ? `end=${r.call.endLine}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<tool_result request="${descriptor}" status="${r.ok ? 'ok' : 'error'}">\n${r.output}\n</tool_result>`;
    })
    .join('\n\n');
}

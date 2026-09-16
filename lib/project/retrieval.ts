import type { IndexedFile, ProjectIndex, RetrievalResult, RetrievedSlice } from '@/types/project';

/**
 * Retrieval, not dumping.
 *
 * The whole project is never sent to the model. Instead each turn we score
 * files against the user's message plus workspace state, then include the
 * highest-scoring files in full while they fit the budget, and fall back to
 * symbol-dense slices when they do not.
 */

export interface RetrievalInput {
  index: ProjectIndex;
  query: string;
  activeFilePath?: string;
  /** Files the user edited by hand — these must never be dropped silently. */
  userEditedPaths?: string[];
  /** Paths already read via tool calls this turn; deprioritised to avoid duplication. */
  alreadyIncluded?: string[];
  budgetChars?: number;
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  auth: ['auth', 'login', 'logout', 'signin', 'signup', 'register', 'session', 'jwt', 'oauth', 'middleware', 'password', 'credential'],
  routing: ['route', 'router', 'page', 'navigation', 'link', 'redirect', 'slug', 'param'],
  api: ['api', 'endpoint', 'handler', 'controller', 'fetch', 'request', 'response', 'rest', 'graphql'],
  data: ['database', 'db', 'schema', 'model', 'migration', 'query', 'prisma', 'sql', 'orm', 'seed'],
  state: ['state', 'store', 'context', 'reducer', 'hook', 'provider', 'zustand', 'redux'],
  styling: ['style', 'css', 'tailwind', 'theme', 'dark', 'light', 'color', 'layout', 'responsive', 'font'],
  ui: ['component', 'button', 'modal', 'form', 'input', 'card', 'navbar', 'header', 'footer', 'sidebar', 'dialog'],
  test: ['test', 'spec', 'jest', 'vitest', 'mock', 'coverage', 'e2e'],
  build: ['build', 'bundle', 'config', 'webpack', 'vite', 'compile', 'deploy', 'docker', 'ci'],
  security: ['security', 'xss', 'csrf', 'cors', 'sanitize', 'vulnerab', 'owasp', 'encrypt', 'hash'],
};

/**
 * Filenames that carry no signal on their own. In framework projects half the
 * tree is called page.tsx or index.ts — the *directory* is what identifies the
 * file, so a bare stem match on these must not outrank a path-segment match.
 */
const GENERIC_FILENAMES = new Set([
  'page', 'index', 'layout', 'route', 'main', 'app', 'default', 'mod', 'init', 'utils', 'types',
]);

/** Words too common to carry signal. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'this', 'that', 'with', 'from', 'into', 'your', 'you', 'can', 'are', 'was',
  'file', 'files', 'code', 'please', 'make', 'add', 'use', 'using', 'how', 'what', 'why', 'all',
  'dan', 'yang', 'untuk', 'dengan', 'ini', 'itu', 'saya', 'kamu', 'dari', 'pada', 'agar', 'bisa',
  'tolong', 'buat', 'ubah', 'tambah', 'jadi', 'ada', 'tidak', 'atau',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_$./-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function detectTopics(query: string): Set<string> {
  const lower = query.toLowerCase();
  const topics = new Set<string>();
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) topics.add(topic);
  }
  return topics;
}

interface ScoredFile {
  file: IndexedFile;
  score: number;
  reasons: string[];
}

export function scoreFiles(input: RetrievalInput): ScoredFile[] {
  const { index, query, activeFilePath, userEditedPaths = [] } = input;
  const lowerQuery = query.toLowerCase();
  const tokens = tokenize(query);
  const topics = detectTopics(query);
  const editedSet = new Set(userEditedPaths);

  // Neighbours of the active file get a boost so edits stay coherent.
  const neighbourPaths = new Set<string>();
  if (activeFilePath) {
    const idx = index.byPath[activeFilePath];
    if (idx !== undefined) {
      const active = index.files[idx];
      active.dependsOn.forEach((p) => neighbourPaths.add(p));
      active.dependedOnBy.forEach((p) => neighbourPaths.add(p));
    }
  }

  const scored: ScoredFile[] = [];

  for (const file of index.files) {
    if (file.content === null) continue;

    let score = 0;
    const reasons: string[] = [];
    const lowerPath = file.path.toLowerCase();
    const lowerName = file.name.toLowerCase();
    const stem = lowerName.replace(/\.[^.]+$/, '');

    // 1. Named directly in the message — the strongest possible signal.
    const segments = lowerPath.split('/');
    const parentDir = segments.length > 1 ? segments[segments.length - 2] : '';

    if (lowerQuery.includes(lowerPath)) {
      score += 200;
      reasons.push('named in request');
    } else if (GENERIC_FILENAMES.has(stem)) {
      // "the login page" identifies app/login/page.tsx, not app/page.tsx.
      if (parentDir && parentDir.length >= 3 && lowerQuery.includes(parentDir)) {
        score += 120;
        reasons.push(`in ${parentDir}/`);
      }
    } else if (stem.length >= 3 && lowerQuery.includes(stem)) {
      score += 110;
      reasons.push('filename mentioned');
    }

    // Any non-generic directory named in the message is a strong locator.
    for (const segment of segments.slice(0, -1)) {
      if (segment.length >= 3 && !GENERIC_FILENAMES.has(segment) && lowerQuery.includes(segment)) {
        score += 35;
        if (!reasons.includes(`in ${segment}/`)) reasons.push(`in ${segment}/`);
      }
    }

    // 2. Exported symbol referenced in the message.
    const namedSymbol = [...file.symbols.exports, ...file.symbols.definitions].find(
      (sym) => sym.length >= 4 && lowerQuery.includes(sym.toLowerCase())
    );
    if (namedSymbol) {
      score += 90;
      reasons.push(`defines ${namedSymbol}`);
    }

    // 3. Workspace state.
    if (file.path === activeFilePath) {
      score += 85;
      reasons.push('open in editor');
    }
    if (editedSet.has(file.path)) {
      score += 95;
      reasons.push('edited by user');
    }
    if (neighbourPaths.has(file.path)) {
      score += 45;
      reasons.push('linked to open file');
    }

    // 4. Topic match on the path.
    for (const topic of topics) {
      if (TOPIC_KEYWORDS[topic].some((kw) => lowerPath.includes(kw))) {
        score += 55;
        reasons.push(`${topic} related`);
        break;
      }
    }

    // 5. Lexical overlap between query tokens and path/symbols.
    let tokenHits = 0;
    for (const token of tokens) {
      if (lowerPath.includes(token)) tokenHits += 2;
      else if (file.symbols.definitions.some((d) => d.toLowerCase().includes(token))) tokenHits += 1;
    }
    if (tokenHits > 0) {
      score += Math.min(tokenHits * 12, 60);
      reasons.push('keyword match');
    }

    // 6. Structural importance: hubs and entry points matter even when unmentioned.
    if (index.manifest.entryPoints.includes(file.path)) {
      score += 40;
      reasons.push('entry point');
    }
    if (index.manifest.configs.includes(file.path)) {
      score += 28;
      reasons.push('configuration');
    }
    score += Math.min(file.dependedOnBy.length * 6, 30);

    // 7. Penalise noise: lockfiles and generated output are rarely useful in context.
    if (/lock|\.min\.|dist\/|build\/|\.map$/.test(lowerPath)) score -= 80;
    if (file.lineCount > 3000) score -= 25;

    if (score > 0) scored.push({ file, score, reasons });
  }

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Extracts the most informative region of a long file: imports at the top plus
 * the neighbourhood of query-matching lines. Always reports the true line range.
 */
function sliceFile(file: IndexedFile, query: string, maxChars: number): RetrievedSlice {
  const content = file.content || '';
  const lines = content.split('\n');
  const totalLines = lines.length;

  if (content.length <= maxChars) {
    return {
      path: file.path,
      language: file.language,
      startLine: 1,
      endLine: totalLines,
      totalLines,
      content,
      complete: true,
      reasons: [],
      score: 0,
    };
  }

  const tokens = tokenize(query);
  let bestLine = 0;
  let bestHits = -1;
  const window = 60;

  for (let i = 0; i < totalLines; i += 20) {
    const chunk = lines.slice(i, i + window).join('\n').toLowerCase();
    let hits = 0;
    for (const token of tokens) if (chunk.includes(token)) hits++;
    if (hits > bestHits) {
      bestHits = hits;
      bestLine = i;
    }
  }

  // Budget: keep the file header (imports/exports) plus the matched region.
  const headerLines = Math.min(40, totalLines);
  const header = lines.slice(0, headerLines).join('\n');
  const remainingChars = Math.max(maxChars - header.length - 120, 400);

  let start = bestLine;
  let end = bestLine;
  let size = 0;
  while (end < totalLines && size < remainingChars) {
    size += lines[end].length + 1;
    end++;
  }
  while (start > headerLines && size < remainingChars) {
    start--;
    size += lines[start].length + 1;
  }

  const body = lines.slice(start, end).join('\n');
  const parts = [`${header}`];
  if (start > headerLines) parts.push(`\n... [lines ${headerLines + 1}-${start} omitted] ...\n`);
  parts.push(body);
  if (end < totalLines) parts.push(`\n... [lines ${end + 1}-${totalLines} omitted — use read_range to see them] ...`);

  return {
    path: file.path,
    language: file.language,
    startLine: 1,
    endLine: end,
    totalLines,
    content: parts.join('\n'),
    complete: false,
    reasons: [],
    score: 0,
  };
}

export function retrieveContext(input: RetrievalInput): RetrievalResult {
  const budgetChars = input.budgetChars ?? 60000;
  const alreadyIncluded = new Set(input.alreadyIncluded || []);
  const scored = scoreFiles(input);

  const slices: RetrievedSlice[] = [];
  const omitted: string[] = [];
  let used = 0;

  for (const { file, score, reasons } of scored) {
    if (alreadyIncluded.has(file.path)) continue;
    const remaining = budgetChars - used;
    if (remaining < 800) {
      omitted.push(file.path);
      continue;
    }

    // Small files go in whole; large ones are sliced rather than skipped.
    const perFileCap = Math.min(remaining, Math.max(4000, Math.floor(budgetChars * 0.35)));
    const slice = sliceFile(file, input.query, perFileCap);
    slice.score = score;
    slice.reasons = reasons;

    used += slice.content.length + slice.path.length + 60;
    slices.push(slice);

    if (slices.length >= 25) break;
  }

  for (const { file } of scored.slice(slices.length)) {
    if (!omitted.includes(file.path)) omitted.push(file.path);
  }

  return { slices, omitted, usedChars: used, budgetChars };
}

export function formatSlicesForModel(result: RetrievalResult): string {
  if (result.slices.length === 0) return '';
  const blocks = result.slices.map((slice) => {
    const range = slice.complete
      ? `full file, ${slice.totalLines} lines`
      : `partial, ${slice.totalLines} lines total`;
    const why = slice.reasons.length ? ` — ${slice.reasons.join(', ')}` : '';
    return `<<<FILE ${slice.path} (${range})${why}>>>\n${slice.content}\n<<<END ${slice.path}>>>`;
  });
  return blocks.join('\n\n');
}

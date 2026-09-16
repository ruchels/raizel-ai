/**
 * Verification harness for the parts of RAIZEL that must not silently lie:
 * the project indexer, context retrieval, workspace operations, memory, and
 * the secret gate.
 *
 * Run with:  npx tsx scripts/verify.ts
 */

import assert from 'node:assert/strict';
import { buildProjectIndex, extractSymbols, type RawProjectFile } from '../lib/project/indexer';
import { retrieveContext } from '../lib/project/retrieval';
import { executeToolCall, parseToolCalls, stripToolCalls } from '../lib/project/tools';
import { applyArtifactOperations, parseArtifactFromResponse, buildFileTree } from '../lib/artifact';
import {
  createMemoryItem,
  findAutoCaptureCandidates,
  findDuplicate,
  parseMemoryCommands,
  parseMemoryTags,
  retrieveMemories,
  validateMemoryContent,
} from '../lib/memory/engine';
import { isUnsafeForMemory, redactSecrets, scanForSecrets } from '../lib/security/secrets';
import { isSafeExportPath, normalizeRelativePath } from '../lib/zip';
import { looksBinary, getFileKind, inferLanguage } from '../lib/fs/fileTypes';
import type { ArtifactProject } from '../types/artifact';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  pass  ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error instanceof Error ? error.message : String(error)}`);
  }
}

function section(name: string): void {
  console.log(`\n${name}`);
}

/* ------------------------------------------------------------------ */
/* Fixture: a small but realistic Next.js project                      */
/* ------------------------------------------------------------------ */

const FIXTURE: RawProjectFile[] = [
  {
    path: 'package.json',
    bytes: 300,
    content: JSON.stringify({
      name: 'demo-app',
      scripts: { dev: 'next dev', build: 'next build' },
      dependencies: { next: '15.0.0', react: '19.0.0', 'next-auth': '5.0.0' },
      devDependencies: { typescript: '^5', tailwindcss: '^4' },
    }),
  },
  { path: 'package-lock.json', bytes: 50, content: '{}' },
  { path: 'tsconfig.json', bytes: 40, content: '{"compilerOptions":{"paths":{"@/*":["./*"]}}}' },
  {
    path: 'app/page.tsx',
    bytes: 200,
    content: [
      "import { getSession } from '@/lib/auth';",
      "import Header from '../components/Header';",
      '',
      'export default function Page() {',
      '  return <Header />;',
      '}',
    ].join('\n'),
  },
  {
    path: 'app/login/page.tsx',
    bytes: 180,
    content: [
      "import { signIn } from '@/lib/auth';",
      '',
      'export default function LoginPage() {',
      '  return <button onClick={() => signIn()}>Sign in</button>;',
      '}',
    ].join('\n'),
  },
  {
    path: 'lib/auth.ts',
    bytes: 260,
    content: [
      "import { cookies } from 'next/headers';",
      '',
      'export interface Session { userId: string }',
      '',
      'export async function getSession(): Promise<Session | null> {',
      '  const store = await cookies();',
      "  const raw = store.get('sid')?.value;",
      '  return raw ? { userId: raw } : null;',
      '}',
      '',
      'export async function signIn() {}',
    ].join('\n'),
  },
  {
    path: 'components/Header.tsx',
    bytes: 120,
    content: "export default function Header() {\n  return <header>demo</header>;\n}",
  },
  { path: 'README.md', bytes: 60, content: '# demo-app\n\nA demo.' },
  {
    path: 'public/logo.png',
    bytes: 4096,
    content: null,
    unreadableReason: 'binary',
    unreadableDetail: 'Binary image; contents were not read.',
  },
];

const index = buildProjectIndex(FIXTURE, 'demo-app');

/* ------------------------------------------------------------------ */

section('File type detection');

test('classifies extensions', () => {
  assert.equal(getFileKind('app/page.tsx'), 'code');
  assert.equal(getFileKind('styles.css'), 'style');
  assert.equal(getFileKind('package.json'), 'config');
  assert.equal(getFileKind('logo.png'), 'image');
  assert.equal(getFileKind('bundle.wasm'), 'binary');
  assert.equal(inferLanguage('main.py'), 'python');
});

test('recognises extension-less config files', () => {
  assert.equal(getFileKind('Dockerfile'), 'config');
  assert.equal(getFileKind('.env.local'), 'config');
});

test('detects binary content from decoded text', () => {
  assert.equal(looksBinary('const a = 1;'), false);
  assert.equal(looksBinary('PK\u0003\u0004\u0000\u0000binary'), true);
});

/* ------------------------------------------------------------------ */

section('Project indexer');

test('counts readable and unreadable files honestly', () => {
  assert.equal(index.manifest.fileCount, 9);
  assert.equal(index.manifest.readableCount, 8);
  assert.equal(index.manifest.unreadableCount, 1);
  const logo = index.files.find((f) => f.path === 'public/logo.png');
  assert.equal(logo?.content, null, 'binary file must not carry fabricated content');
});

test('detects stack and package manager', () => {
  assert.ok(index.manifest.stack.includes('Next.js'));
  assert.ok(index.manifest.stack.includes('React'));
  assert.ok(index.manifest.stack.includes('Tailwind CSS'));
  assert.deepEqual(index.manifest.packageManagers, ['npm']);
});

test('reads dependencies and scripts from package.json', () => {
  const names = index.manifest.dependencies.map((d) => d.name);
  assert.ok(names.includes('next-auth'));
  assert.equal(index.manifest.dependencies.find((d) => d.name === 'typescript')?.dev, true);
  assert.equal(index.manifest.scripts.build, 'next build');
});

test('identifies entry points, configs, and docs', () => {
  assert.ok(index.manifest.entryPoints.includes('app/page.tsx'));
  assert.ok(index.manifest.configs.includes('tsconfig.json'));
  assert.ok(index.manifest.documentation.includes('README.md'));
});

test('resolves the @/ alias and relative imports into a graph', () => {
  const page = index.files.find((f) => f.path === 'app/page.tsx');
  assert.ok(page, 'app/page.tsx must be indexed');
  assert.ok(page.dependsOn.includes('lib/auth.ts'), 'must resolve @/lib/auth');
  assert.ok(page.dependsOn.includes('components/Header.tsx'), 'must resolve ../components/Header');

  const auth = index.files.find((f) => f.path === 'lib/auth.ts');
  assert.ok(auth?.dependedOnBy.includes('app/page.tsx'));
  assert.ok(auth?.dependedOnBy.includes('app/login/page.tsx'));
});

test('extracts exported symbols', () => {
  const symbols = extractSymbols('lib/auth.ts', FIXTURE[5].content as string);
  assert.ok(symbols.exports.includes('getSession'));
  assert.ok(symbols.exports.includes('Session'));
  assert.ok(symbols.exports.includes('signIn'));
});

test('ignores bare package specifiers as file dependencies', () => {
  const auth = index.files.find((f) => f.path === 'lib/auth.ts');
  assert.equal(auth?.dependsOn.length, 0, "'next/headers' is a package, not a project file");
});

/* ------------------------------------------------------------------ */

section('Context retrieval');

test('ranks the login file highest for a login request', () => {
  const result = retrieveContext({ index, query: 'change the login page to use Google OAuth' });
  assert.ok(result.slices.length > 0);
  assert.equal(result.slices[0].path, 'app/login/page.tsx');
});

test('pulls in the auth module the login page imports', () => {
  const result = retrieveContext({ index, query: 'change the login page to use Google OAuth' });
  const paths = result.slices.map((s) => s.path);
  assert.ok(paths.includes('lib/auth.ts'), 'auth module must be retrieved alongside login');
});

test('never sends unreadable files as content', () => {
  const result = retrieveContext({ index, query: 'show me the logo image' });
  assert.ok(!result.slices.some((s) => s.path === 'public/logo.png'));
});

test('respects the character budget and reports omissions', () => {
  const result = retrieveContext({ index, query: 'auth session header page', budgetChars: 1200 });
  assert.ok(result.usedChars <= 1200 + 800, `used ${result.usedChars}`);
  assert.ok(result.slices.length < index.manifest.readableCount);
});

test('marks whole small files as complete', () => {
  const result = retrieveContext({ index, query: 'Header component' });
  const header = result.slices.find((s) => s.path === 'components/Header.tsx');
  assert.equal(header?.complete, true);
});

/* ------------------------------------------------------------------ */

section('Model file-access tools');

test('parses self-closing and wrapped tool tags', () => {
  const text = `Let me look.
<raizel_request tool="read_file" path="lib/auth.ts" />
<raizel_request tool="search_in_project" query="getSession"></raizel_request>`;
  const calls = parseToolCalls(text);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].tool, 'read_file');
  assert.equal(calls[0].path, 'lib/auth.ts');
  assert.equal(calls[1].query, 'getSession');
  assert.equal(stripToolCalls(text), 'Let me look.');
});

test('read_file returns real numbered content', () => {
  const result = executeToolCall(index, {
    tool: 'read_file',
    path: 'lib/auth.ts',
    raw: '',
  });
  assert.equal(result.ok, true);
  assert.ok(result.output.includes('getSession'));
  assert.ok(/^\s+1\| /m.test(result.output), 'output must be line-numbered');
});

test('read_file refuses an unreadable file instead of inventing one', () => {
  const result = executeToolCall(index, { tool: 'read_file', path: 'public/logo.png', raw: '' });
  assert.equal(result.ok, false);
  assert.ok(result.output.includes('could not be read'));
});

test('read_range honours the requested lines', () => {
  const result = executeToolCall(index, {
    tool: 'read_range',
    path: 'lib/auth.ts',
    startLine: 3,
    endLine: 4,
    raw: '',
  });
  assert.ok(result.output.includes('lines 3-4'));
  assert.ok(result.output.includes('Session'));
  assert.ok(!result.output.includes('cookies'), 'line 1 must be excluded');
});

test('search_in_project reports file and line', () => {
  const result = executeToolCall(index, { tool: 'search_in_project', query: 'getSession', raw: '' });
  assert.equal(result.ok, true);
  assert.ok(result.output.includes('lib/auth.ts:'));
  assert.ok(result.output.includes('app/page.tsx:1'));
});

test('missing files suggest close matches rather than failing blindly', () => {
  const result = executeToolCall(index, { tool: 'read_file', path: 'src/auth.ts', raw: '' });
  assert.equal(result.ok, false);
  assert.ok(result.output.includes('lib/auth.ts'), 'should suggest the real path');
});

/* ------------------------------------------------------------------ */

section('Workspace operations');

const baseProject: ArtifactProject = {
  id: 'art_1',
  conversationId: 'conv_1',
  name: 'demo',
  title: 'Demo',
  files: [
    {
      path: 'app/page.tsx',
      name: 'page.tsx',
      content: 'line one\nline two\nline three',
      language: 'tsx',
      isReadable: true,
      updatedAt: 0,
    },
  ],
  activeFilePath: 'app/page.tsx',
  createdAt: 0,
  updatedAt: 0,
  version: 1,
};

test('parses operations with reasons', () => {
  const parsed = parseArtifactFromResponse(`Here is the change.

<raizel_operation operation="update_file" path="app/page.tsx" reason="add a heading">
line one
line two changed
line three
</raizel_operation>`);
  assert.equal(parsed.operations.length, 1);
  assert.equal(parsed.operations[0].reason, 'add a heading');
  assert.equal(parsed.cleanText, 'Here is the change.');
});

test('applies an update and counts real added/removed lines', () => {
  const { project, applied } = applyArtifactOperations(baseProject, [
    { operation: 'update_file', path: 'app/page.tsx', content: 'line one\nline two changed\nline three' },
  ]);
  assert.equal(applied[0].status, 'applied');
  assert.equal(applied[0].addedLines, 1);
  assert.equal(applied[0].removedLines, 1);
  assert.equal(project.files[0].previousContent, 'line one\nline two\nline three');
  assert.equal(project.version, 2);
});

test('reports a no-op instead of claiming a change', () => {
  const { applied, project } = applyArtifactOperations(baseProject, [
    { operation: 'update_file', path: 'app/page.tsx', content: baseProject.files[0].content },
  ]);
  assert.equal(applied[0].status, 'skipped');
  assert.equal(applied[0].skipReason, 'file content is unchanged');
  assert.equal(project.version, 1, 'version must not advance on a no-op');
});

test('rejects path traversal and credential paths', () => {
  const { applied, project } = applyArtifactOperations(baseProject, [
    { operation: 'create_file', path: '../../etc/passwd', content: 'x' },
    { operation: 'create_file', path: '.env', content: 'SECRET=1' },
  ]);
  assert.equal(applied.length, 2);
  assert.ok(applied.every((a) => a.status === 'skipped'));
  assert.equal(project.files.length, 1, 'no unsafe file may be written');
});

test('reports a delete of a file that does not exist', () => {
  const { applied } = applyArtifactOperations(baseProject, [
    { operation: 'delete_file', path: 'does/not/exist.ts' },
  ]);
  assert.equal(applied[0].status, 'skipped');
  assert.equal(applied[0].skipReason, 'file does not exist');
});

test('rename moves the active file pointer', () => {
  const { project, applied } = applyArtifactOperations(baseProject, [
    { operation: 'rename_file', path: 'app/page.tsx', newPath: 'app/home.tsx' },
  ]);
  assert.equal(applied[0].status, 'applied');
  assert.equal(project.activeFilePath, 'app/home.tsx');
  assert.equal(project.files[0].name, 'home.tsx');
});

test('builds a nested file tree with directories first', () => {
  const tree = buildFileTree([
    { path: 'z.txt', name: 'z.txt', content: '', language: 'plaintext', updatedAt: 0 },
    { path: 'app/page.tsx', name: 'page.tsx', content: '', language: 'tsx', updatedAt: 0 },
  ]);
  assert.equal(tree[0].name, 'app');
  assert.equal(tree[0].isDirectory, true);
  assert.equal(tree[0].children?.[0].name, 'page.tsx');
  assert.equal(tree[1].name, 'z.txt');
});

/* ------------------------------------------------------------------ */

section('Path safety');

test('normalises and rejects traversal vectors', () => {
  assert.equal(normalizeRelativePath('./app//page.tsx'), 'app/page.tsx');
  assert.equal(normalizeRelativePath('C:\\app\\page.tsx'), 'app/page.tsx');
  assert.equal(isSafeExportPath('../secrets'), false);
  assert.equal(isSafeExportPath('/etc/passwd'), false);
  assert.equal(isSafeExportPath('%2e%2e/x'), false);
  assert.equal(isSafeExportPath('app/CON.txt'), false);
  assert.equal(isSafeExportPath('app/page.tsx'), true);
});

test('blocks credential files from export', () => {
  for (const path of ['.env', '.env.production', 'id_rsa', 'server.key', 'tokens.json', 'secrets.yml']) {
    assert.equal(isSafeExportPath(path), false, `${path} must be blocked`);
  }
});

/* ------------------------------------------------------------------ */

section('Secret detection');

test('detects common credential shapes', () => {
  assert.equal(scanForSecrets('AKIAIOSFODNN7EXAMPLE').found, true);
  assert.equal(scanForSecrets('ghp_' + 'a'.repeat(36)).found, true);
  assert.equal(scanForSecrets('const x = 1;').found, false);
});

test('redacts without destroying surrounding code', () => {
  const { text, redacted } = redactSecrets('const key = "AKIAIOSFODNN7EXAMPLE";');
  assert.equal(redacted, true);
  assert.ok(text.includes('[REDACTED_BY_RAIZEL]'));
  assert.ok(text.startsWith('const key = '));
});

test('memory gate refuses credentials', () => {
  assert.equal(isUnsafeForMemory('Prefers TypeScript').unsafe, false);
  assert.equal(isUnsafeForMemory('my password is hunter2seventeen').unsafe, true);
  assert.equal(isUnsafeForMemory('API key: AKIAIOSFODNN7EXAMPLE').unsafe, true);
});

/* ------------------------------------------------------------------ */

section('Memory engine');

test('parses explicit remember commands in English and Indonesian', () => {
  assert.equal(
    parseMemoryCommands('ingat bahwa saya lebih suka TypeScript').directives[0]?.kind,
    'remember'
  );
  const english = parseMemoryCommands('Please remember that I prefer pnpm');
  assert.equal(english.directives[0]?.kind, 'remember');
});

test('normalises first person into a durable statement', () => {
  const result = parseMemoryCommands('ingat saya lebih suka TypeScript');
  const directive = result.directives[0];
  assert.equal(directive?.kind, 'remember');
  if (directive?.kind === 'remember') {
    assert.ok(directive.content.startsWith('Prefers'), `got: ${directive.content}`);
  }
});

test('honours forget, forget-all, and do-not-remember', () => {
  assert.equal(parseMemoryCommands('lupakan preferensi tadi').directives[0]?.kind, 'forget');
  assert.equal(parseMemoryCommands('hapus semua memory').directives[0]?.kind, 'forget_all');
  assert.equal(parseMemoryCommands('jangan ingat ini').directives[0]?.kind, 'do_not_remember');
});

test('a do-not-remember suppresses a remember in the same message', () => {
  const result = parseMemoryCommands('jangan ingat ini. ingat bahwa saya suka Vue');
  assert.ok(!result.directives.some((d) => d.kind === 'remember'));
});

test('detects recall questions', () => {
  assert.equal(parseMemoryCommands('apa yang kamu ingat tentang saya?').wantsRecall, true);
  assert.equal(parseMemoryCommands('what do you remember about me').wantsRecall, true);
  assert.equal(parseMemoryCommands('build me a login page').wantsRecall, false);
});

test('auto-capture fires on durable preferences only', () => {
  assert.ok(findAutoCaptureCandidates('saya lebih suka TypeScript daripada JavaScript').length > 0);
  assert.ok(findAutoCaptureCandidates('selalu gunakan pnpm untuk project ini').length > 0);
  assert.equal(
    findAutoCaptureCandidates('add a button to the header please').length,
    0,
    'one-off task instructions must not become memories'
  );
});

test('rejects oversized and unsafe memory content', () => {
  assert.equal(validateMemoryContent('ok').ok, false);
  assert.equal(validateMemoryContent('x'.repeat(600)).ok, false);
  assert.equal(validateMemoryContent('Prefers TypeScript').ok, true);
  assert.equal(validateMemoryContent('my password is correcthorsebattery').ok, false);
});

test('detects near-duplicate memories', () => {
  const existing = [createMemoryItem('Prefers TypeScript over JavaScript')];
  assert.ok(findDuplicate(existing, 'prefers typescript over javascript'));
  assert.equal(findDuplicate(existing, 'Lives in Jakarta'), undefined);
});

test('retrieval surfaces standing instructions even when unmentioned', () => {
  const items = [
    createMemoryItem('Always reply in Indonesian', { category: 'instruction', importance: 5 }),
    createMemoryItem('Likes the colour green', { category: 'preference', importance: 1 }),
  ];
  const retrieved = retrieveMemories(items, 'write a python script', 5);
  assert.ok(retrieved.some((r) => r.item.content.includes('Indonesian')));
});

test('retrieval skips disabled memories', () => {
  const item = createMemoryItem('Prefers TypeScript', { importance: 5 });
  item.enabled = false;
  assert.equal(retrieveMemories([item], 'typescript project', 5).length, 0);
});

test('parses model-emitted memory tags', () => {
  const { tags, cleanText } = parseMemoryTags(
    'Noted.\n<raizel_memory category="technical" importance="5">Uses pnpm</raizel_memory>'
  );
  assert.equal(tags.length, 1);
  assert.equal(tags[0].content, 'Uses pnpm');
  assert.equal(tags[0].category, 'technical');
  assert.equal(tags[0].importance, 5);
  assert.equal(cleanText, 'Noted.');
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

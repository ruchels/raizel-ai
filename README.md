# RAIZEL

An AI assistant with a project workspace, a real file index, and long-term memory.
Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Rindri gateway.

## Setup

```bash
npm install
cp .env.example .env.local   # add RINDRI_API_KEY
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run verify` | 44 assertions over the indexer, retrieval, operations, memory, and secret gate |
| `npm run check` | All three of the above |

## How it works

### File understanding

```
upload → detect type → extract text → normalize → index → manifest → retrieval
```

Every file carries a status. If a file could not be decoded, `content` is `null`,
the reason is recorded, and the UI says so. Nothing is ever presented as read when
it was not.

- **Text and code** — decoded as UTF-8, verified not to be binary.
- **PDF** — `pdfjs-dist` with scripting and font fetching disabled. A scan with no
  text layer reports that instead of returning an empty string.
- **DOCX** — `word/document.xml` parsed directly (paragraphs, tabs, breaks, entities).
- **Binary** — recorded in the tree, contents never fabricated.

### Project index

Importing a ZIP builds a manifest: stack, package manager (from lockfiles), entry
points, configs, dependencies, scripts, environment variables, and a two-way import
graph that resolves both relative paths and the `@/` alias.

### Retrieval, not dumping

The whole repository is never sent. Each turn, files are scored against the message,
the open file, the import graph, and structural importance. High scorers go in whole
while they fit the budget; long files are sliced with the true line range reported.

The model can ask for more and the client resolves it locally:

```
<raizel_request tool="read_file" path="lib/auth.ts" />
<raizel_request tool="read_range" path="app/page.tsx" start="120" end="260" />
<raizel_request tool="read_multiple_files" paths="lib/db.ts,lib/schema.ts" />
<raizel_request tool="search_in_project" query="createSession" />
<raizel_request tool="list_files" path="components/" />
```

### Workspace operations

Changes arrive as explicit operations with a stated reason:

```
<raizel_operation operation="update_file" path="app/page.tsx" reason="add dark mode toggle">
{the entire file}
</raizel_operation>
```

Each one is applied and reported: applied or skipped, with added/removed line counts
and a diff. A no-op is reported as a no-op. Unsafe paths are refused.

### Memory

Long-term memory is separate from conversation history.

```ts
interface MemoryItem {
  id; content; category; source; importance; enabled;
  keywords; useCount; createdAt; updatedAt;
}
```

Categories: `preference`, `profile`, `project`, `instruction`, `workflow`, `technical`.

Written by explicit request (`"ingat bahwa saya lebih suka TypeScript"`,
`"remember that I prefer pnpm"`), by conservative auto-capture of durable
preferences, or by the model tagging a fact. Retrieval is relevance-scored;
standing instructions carry a baseline so they survive off-topic turns.

`Settings → Memory` provides on/off, auto-save on/off, search, per-item enable and
delete, and clear-all. Every control writes through to the store.

Storage sits behind an async `MemoryStore` interface. It is localStorage today;
moving to a server database means one new class and no other changes.

### Security

- `RINDRI_API_KEY` is read only in `app/api/chat/route.ts` and never reaches the client.
- Model IDs are checked against a whitelist; image data URLs are pattern-matched;
  message count and size are bounded.
- One shared secret detector (`lib/security/secrets.ts`) governs ZIP export redaction
  and the memory write gate.
- `.env*`, `*.pem`, `*.key`, `id_rsa`, `credentials.*`, `secrets.*`, `tokens.*`,
  `.netrc`, `.pgpass` are blocked from import, export, and write operations, as is
  path traversal in any encoding.

## Deploying

Set `RINDRI_API_KEY` and `RINDRI_BASE_URL` as environment variables. `.env.local`
is gitignored and is excluded from every export path.

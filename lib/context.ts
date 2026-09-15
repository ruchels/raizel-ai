import { ArtifactProject, ArtifactFile } from '@/types/artifact';
import { normalizeRelativePath } from '@/lib/zip';

interface FileRelevanceScore {
  file: ArtifactFile;
  score: number;
  reasons: string[];
}

// Semantic topic associations for smart context expansion
const SEMANTIC_TOPIC_KEYWORDS: Record<string, string[]> = {
  auth: [
    'auth', 'login', 'logout', 'signup', 'register', 'session', 'middleware',
    'jwt', 'token', 'user', 'dashboard', 'protect', 'oauth', 'profile', 'redirect'
  ],
  styling: [
    'style', 'css', 'tailwind', 'theme', 'color', 'dark', 'light', 'hero',
    'navbar', 'header', 'footer', 'button', 'card', 'font', 'animation', 'layout'
  ],
  api: [
    'api', 'route', 'endpoint', 'fetch', 'backend', 'server', 'handler',
    'controller', 'request', 'response', 'crud'
  ],
  data: [
    'db', 'database', 'prisma', 'sql', 'model', 'schema', 'table', 'migration',
    'query', 'entity', 'store', 'state', 'context'
  ],
  security: [
    'security', 'owasp', 'audit', 'vuln', 'sanitiz', 'cors', 'header',
    'xss', 'csrf', 'rate-limit', 'encrypt', 'hash', 'secret'
  ],
  test: [
    'test', 'spec', 'jest', 'vitest', 'unit', 'mock', 'assert', 'fixture'
  ],
};

/**
 * Extracts dependency import paths from file content.
 */
function extractImportPaths(content: string): string[] {
  const paths: string[] = [];
  const regex = /(?:import\s+(?:[\w*\s{},]+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const raw = match[1] || match[2];
    if (raw && raw.startsWith('.')) {
      paths.push(raw);
    }
  }
  return paths;
}

/**
 * Intelligently scores and ranks project files based on the user's prompt,
 * active file, manual user edits, and semantic relationships.
 */
export function scoreProjectFiles(
  project: ArtifactProject,
  userPrompt: string
): FileRelevanceScore[] {
  const files = project.files || [];
  const lowerPrompt = userPrompt.toLowerCase();
  const scored: FileRelevanceScore[] = [];

  // Identify active semantic topics from user prompt
  const activeTopics = new Set<string>();
  for (const [topic, keywords] of Object.entries(SEMANTIC_TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (lowerPrompt.includes(kw)) {
        activeTopics.add(topic);
        break;
      }
    }
  }

  // Identify files imported by active file
  const activeFile = files.find((f) => f.path === project.activeFilePath);
  const activeImports = activeFile ? extractImportPaths(activeFile.content || '') : [];

  for (const file of files) {
    const normPath = normalizeRelativePath(file.path);
    const fileName = file.name || normPath.split('/').pop() || normPath;
    const lowerNorm = normPath.toLowerCase();
    const lowerName = fileName.toLowerCase();

    let score = 0;
    const reasons: string[] = [];

    // 1. Explicitly mentioned by user in prompt
    if (lowerPrompt.includes(lowerName) || lowerPrompt.includes(lowerNorm)) {
      score += 120;
      reasons.push('Mentioned in prompt');
    }

    // 2. Active file in editor
    if (normPath === project.activeFilePath) {
      score += 80;
      reasons.push('Currently active file in workspace');
    }

    // 3. User manually modified file in this session (CRITICAL: NEVER REVERT USER EDITS)
    if (file.isModified) {
      score += 70;
      reasons.push('Recently edited by user');
    }

    // 4. Semantic keyword & concept match
    for (const topic of activeTopics) {
      const topicKeywords = SEMANTIC_TOPIC_KEYWORDS[topic] || [];
      const matchesTopic = topicKeywords.some((kw) => lowerNorm.includes(kw));
      if (matchesTopic) {
        score += 50;
        reasons.push(`Related to ${topic} context`);
        break;
      }
    }

    // 5. Directly imported by active file
    if (activeImports.some((imp) => lowerNorm.includes(imp.replace(/^\.\.?\//, '').toLowerCase()))) {
      score += 40;
      reasons.push('Imported by active file');
    }

    // 6. Foundation & Configuration files
    if (lowerName === 'package.json') {
      score += 45;
      reasons.push('Project manifest');
    } else if (lowerName === 'tsconfig.json' || lowerName.includes('next.config') || lowerName.includes('vite.config')) {
      score += 35;
      reasons.push('Build configuration');
    } else if (lowerNorm === 'app/layout.tsx' || lowerNorm === 'app/layout.jsx' || lowerName === 'index.html') {
      score += 40;
      reasons.push('Root application entry/layout');
    } else if (lowerNorm.includes('types/') || lowerNorm.endsWith('.d.ts')) {
      score += 30;
      reasons.push('Type definitions');
    }

    scored.push({ file, score, reasons });
  }

  // Sort descending by score
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Builds a structured, high-signal project context payload for the AI model.
 * Enforces a character budget to prevent prompt bloat while ensuring maximum
 * relevance and preserving user manual edits.
 */
export function buildProjectContext(
  project: ArtifactProject | null,
  userPrompt: string,
  maxContentChars = 48000
): {
  hasContext: boolean;
  systemPromptAddition?: string;
  includedFilesCount: number;
} {
  if (!project || !project.files || project.files.length === 0) {
    return { hasContext: false, includedFilesCount: 0 };
  }

  const files = project.files;
  const scoredFiles = scoreProjectFiles(project, userPrompt);

  // 1. File tree overview (always included)
  const treeLines = files.map((f) => {
    const isAct = f.path === project.activeFilePath ? ' [ACTIVE]' : '';
    const isMod = f.isModified ? ' [MODIFIED_BY_USER]' : '';
    return `- ${f.path} (${f.language || 'text'}, ${f.content.length} chars)${isAct}${isMod}`;
  });

  // 2. Select top files within character budget
  const selectedFileSnippets: string[] = [];
  let currentBudget = 0;
  let includedCount = 0;

  for (const { file, reasons } of scoredFiles) {
    // Only include if score > 0 or if we haven't included any yet
    if (reasons.length === 0 && includedCount >= 5) continue;

    const content = file.content || '';
    const sliceLen = Math.min(content.length, 16000);
    const snippetContent = content.slice(0, sliceLen) + (content.length > sliceLen ? '\n// ... [truncated for context]' : '');

    const snippet = `--- File: ${file.path} (${file.language || 'code'}) [${reasons.join(', ')}] ---\n${snippetContent}`;

    if (currentBudget + snippet.length > maxContentChars) {
      break;
    }

    selectedFileSnippets.push(snippet);
    currentBudget += snippet.length;
    includedCount++;
  }

  const modifiedList = files.filter((f) => f.isModified).map((f) => f.path);
  const userEditNotice = modifiedList.length > 0
    ? `\nCRITICAL USER EDIT NOTICE: The user has manually edited the following files: [${modifiedList.join(', ')}]. The content shown below reflects their latest manual edits. DO NOT revert or discard their changes unless specifically instructed.`
    : '';

  const contextMessage = `══════════════════════════════════════════════════════════════
  ACTIVE PROJECT CONTEXT: "${project.name}" (${project.title || project.name})
══════════════════════════════════════════════════════════════
Total Files in Workspace: ${files.length} | Project Version: ${project.version || 1}
Active File: ${project.activeFilePath || 'None'}${userEditNotice}

WORKSPACE FILE TREE:
${treeLines.join('\n')}

RELEVANT FILE CONTENTS (Selected based on user query, active file, imports, and user edits):
${selectedFileSnippets.join('\n\n')}

INSTRUCTIONS FOR AI RESPONSE:
- When modifying this project, use <raizel_operation operation="create_file|update_file|delete_file|rename_file" path="..."> tags.
- For "update_file", provide the 100% COMPLETE updated file content (not partial diffs).
- Ensure all relative imports and dependencies remain valid across files.`;

  return {
    hasContext: true,
    systemPromptAddition: contextMessage,
    includedFilesCount: includedCount,
  };
}

import {
  ArtifactFile,
  ArtifactOperation,
  ArtifactProject,
  FileTreeNode,
  ProjectTemplate,
} from '@/types/artifact';
import { normalizeRelativePath, isSafeExportPath } from './zip';

/**
 * Infers code language from file extension
 */
export function inferLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'py':
      return 'python';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
    case 'sass':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'sql':
      return 'sql';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'hpp':
      return 'cpp';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'xml':
    case 'svg':
      return 'xml';
    default:
      return 'plaintext';
  }
}

/**
 * Converts a flat list of ArtifactFiles into a hierarchical FileTree
 */
export function buildFileTree(files: ArtifactFile[]): FileTreeNode[] {
  const rootNodes: FileTreeNode[] = [];

  for (const file of files) {
    const normalized = normalizeRelativePath(file.path);
    const segments = normalized.split('/');
    let currentLevel = rootNodes;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isFile = i === segments.length - 1;
      const currentPath = segments.slice(0, i + 1).join('/');

      let existing = currentLevel.find((n) => n.name === segment);

      if (!existing) {
        if (isFile) {
          existing = {
            name: segment,
            path: currentPath,
            isDirectory: false,
            language: file.language,
            isModified: file.isModified,
          };
          currentLevel.push(existing);
        } else {
          existing = {
            name: segment,
            path: currentPath,
            isDirectory: true,
            children: [],
          };
          currentLevel.push(existing);
        }
      }

      if (!isFile && existing.children) {
        currentLevel = existing.children;
      }
    }
  }

  // Sort nodes: directories first, then alphabetical
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => ({
        ...node,
        children: node.children ? sortNodes(node.children) : undefined,
      }));
  };

  return sortNodes(rootNodes);
}

/**
 * Safely applies an array of operations (create/update/delete/rename) to an ArtifactProject
 */
export function applyArtifactOperations(
  currentProject: ArtifactProject,
  operations: ArtifactOperation[]
): ArtifactProject {
  let updatedFiles = [...currentProject.files];
  let activePath = currentProject.activeFilePath;

  for (const op of operations) {
    const normPath = normalizeRelativePath(op.path);
    if (!isSafeExportPath(normPath)) {
      console.warn(`[Artifact] Skipped unsafe operation path: ${op.path}`);
      continue;
    }

    if (op.operation === 'create_file' || op.operation === 'update_file') {
      const existingIdx = updatedFiles.findIndex((f) => normalizeRelativePath(f.path) === normPath);
      const language = op.language || inferLanguageFromPath(normPath);
      const name = normPath.split('/').pop() || normPath;
      const content = op.content || '';

      if (existingIdx >= 0) {
        const prev = updatedFiles[existingIdx];
        updatedFiles[existingIdx] = {
          ...prev,
          path: normPath,
          name,
          content,
          language,
          previousContent: prev.content !== content ? prev.content : prev.previousContent,
          isModified: true,
          updatedAt: Date.now(),
        };
      } else {
        updatedFiles.push({
          path: normPath,
          name,
          content,
          language,
          isModified: true,
          updatedAt: Date.now(),
        });
      }
    } else if (op.operation === 'delete_file') {
      updatedFiles = updatedFiles.filter((f) => normalizeRelativePath(f.path) !== normPath);
      if (normalizeRelativePath(activePath) === normPath) {
        activePath = updatedFiles[0]?.path || '';
      }
    } else if (op.operation === 'rename_file' && op.newPath) {
      const newNorm = normalizeRelativePath(op.newPath);
      if (isSafeExportPath(newNorm)) {
        updatedFiles = updatedFiles.map((f) => {
          if (normalizeRelativePath(f.path) === normPath) {
            return {
              ...f,
              path: newNorm,
              name: newNorm.split('/').pop() || newNorm,
              language: inferLanguageFromPath(newNorm),
              isModified: true,
              updatedAt: Date.now(),
            };
          }
          return f;
        });
        if (normalizeRelativePath(activePath) === normPath) {
          activePath = newNorm;
        }
      }
    }
  }

  // Ensure activeFilePath points to a valid file in the project
  if (!updatedFiles.some((f) => normalizeRelativePath(f.path) === normalizeRelativePath(activePath))) {
    activePath = updatedFiles[0]?.path || '';
  }

  return {
    ...currentProject,
    files: updatedFiles,
    activeFilePath: activePath,
    updatedAt: Date.now(),
    version: (currentProject.version || 1) + 1,
  };
}

/**
 * Generation stages for large project scaffolding
 */
export const GENERATION_STAGES = [
  { id: 'plan', label: 'Architecture & Plan' },
  { id: 'structure', label: 'Project Structure' },
  { id: 'config', label: 'Core Configuration' },
  { id: 'features', label: 'Feature Implementation' },
  { id: 'styling', label: 'Styling & Polish' },
  { id: 'review', label: 'Final Verification' },
] as const;

/**
 * Detects real generation progress stages from streaming response text.
 */
export function detectCurrentGenerationStage(text: string): {
  stage: string;
  stageIndex: number;
  percent: number;
} {
  const lower = text.toLowerCase();

  if (lower.includes('</raizel_artifact>') || lower.includes('final review') || lower.includes('complete files')) {
    return { stage: 'Final Verification', stageIndex: 5, percent: 95 };
  }
  if (lower.includes('globals.css') || lower.includes('.css') || lower.includes('tailwind')) {
    return { stage: 'Styling & Polish', stageIndex: 4, percent: 80 };
  }
  if (lower.includes('components/') || lower.includes('app/page') || lower.includes('src/')) {
    return { stage: 'Feature Implementation', stageIndex: 3, percent: 60 };
  }
  if (lower.includes('package.json') || lower.includes('tsconfig.json') || lower.includes('requirements.txt')) {
    return { stage: 'Core Configuration', stageIndex: 2, percent: 35 };
  }
  if (lower.includes('<raizel_artifact') || lower.includes('file structure') || lower.includes('files:')) {
    return { stage: 'Project Structure', stageIndex: 1, percent: 20 };
  }

  return { stage: 'Architecture & Plan', stageIndex: 0, percent: 10 };
}

/**
 * Progressively extracts completed <file> tags from an in-progress stream.
 * Allows the file tree and right-side editor to update dynamically while the AI is writing.
 */
export function extractStreamingFiles(streamText: string): ArtifactFile[] {
  const fileRegex = /<file\s+([^>]*?)>([\s\S]*?)<\/file>/gi;
  const files: ArtifactFile[] = [];
  let fileMatch: RegExpExecArray | null;

  const getAttr = (raw: string, name: string): string | undefined => {
    const doubleQuote = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
    const singleQuote = new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i');
    const noQuote = new RegExp(`${name}\\s*=\\s*(\\S+)`, 'i');
    const m = doubleQuote.exec(raw) || singleQuote.exec(raw) || noQuote.exec(raw);
    return m ? m[1].trim() : undefined;
  };

  while ((fileMatch = fileRegex.exec(streamText)) !== null) {
    const fileAttrs = fileMatch[1];
    const rawPath = getAttr(fileAttrs, 'path');
    if (!rawPath) continue;

    const normPath = normalizeRelativePath(rawPath);
    if (!isSafeExportPath(normPath)) continue;

    const langAttr = getAttr(fileAttrs, 'language') || getAttr(fileAttrs, 'lang');
    const content = fileMatch[2].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    const language = langAttr || inferLanguageFromPath(normPath);
    const fileName = normPath.split('/').pop() || normPath;

    files.push({
      path: normPath,
      name: fileName,
      content,
      language,
      updatedAt: Date.now(),
    });
  }

  return files;
}

/**
 * Extracts artifact structures or file operations from AI text response.
 * Supports multiple tag formats and attribute variations for robust parsing.
 * Looks for tags:
 * <raizel_artifact project="..." title="..." description="...">
 *   <file path="...">...</file>
 * </raizel_artifact>
 * or
 * <raizel_operation operation="create_file|update_file|delete_file|rename_file" path="..." newPath="...">
 *   ...content...
 * </raizel_operation>
 */
export function parseArtifactFromResponse(text: string): {
  project?: {
    name: string;
    title: string;
    description?: string;
    files: ArtifactFile[];
  };
  operations?: ArtifactOperation[];
  cleanText: string;
} {
  let cleanText = text;

  // Helper: extract attribute value from a raw attributes string
  // Supports: attr="value", attr='value', attr=value (no spaces in value)
  const getAttr = (raw: string, name: string): string | undefined => {
    const doubleQuote = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
    const singleQuote = new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i');
    const noQuote = new RegExp(`${name}\\s*=\\s*(\\S+)`, 'i');
    const m = doubleQuote.exec(raw) || singleQuote.exec(raw) || noQuote.exec(raw);
    return m ? m[1].trim() : undefined;
  };

  // 1. Check for complete <raizel_artifact> block
  // Support variations: extra whitespace, multiline attributes, self-closing variations
  const artifactBlockRegex = /<raizel_artifact\s+([^>]*?)>([\s\S]*?)<\/raizel_artifact>/i;
  const artifactMatch = text.match(artifactBlockRegex);

  if (artifactMatch) {
    const rawAttrs = artifactMatch[1];
    const innerContent = artifactMatch[2];

    const name = getAttr(rawAttrs, 'project') || getAttr(rawAttrs, 'name') || 'project';
    const title = getAttr(rawAttrs, 'title') || `${name} Project`;
    const description = getAttr(rawAttrs, 'description');

    const fileRegex = /<file\s+([^>]*?)>([\s\S]*?)<\/file>/gi;
    const files: ArtifactFile[] = [];
    let fileMatch: RegExpExecArray | null;

    while ((fileMatch = fileRegex.exec(innerContent)) !== null) {
      const fileAttrs = fileMatch[1];
      const rawPath = getAttr(fileAttrs, 'path');
      if (!rawPath) continue;

      const normPath = normalizeRelativePath(rawPath);
      if (!isSafeExportPath(normPath)) continue;

      const langAttr = getAttr(fileAttrs, 'language') || getAttr(fileAttrs, 'lang');
      const content = fileMatch[2].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
      const language = langAttr || inferLanguageFromPath(normPath);
      const fileName = normPath.split('/').pop() || normPath;

      files.push({
        path: normPath,
        name: fileName,
        content,
        language,
        updatedAt: Date.now(),
      });
    }

    // Strip artifact markup from displayed chat message text to keep chat message clean
    cleanText = text.replace(artifactBlockRegex, '').trim();

    return {
      project: {
        name,
        title,
        description,
        files,
      },
      cleanText,
    };
  }

  // 2. Check for individual <raizel_operation> tags
  // Support variations in attribute ordering (operation/path can be in any order)
  const opRegex = /<raizel_operation\s+([^>]*?)>([\s\S]*?)<\/raizel_operation>/gi;
  const operations: ArtifactOperation[] = [];
  let opMatch: RegExpExecArray | null;

  while ((opMatch = opRegex.exec(text)) !== null) {
    const opAttrs = opMatch[1];
    const opType = getAttr(opAttrs, 'operation') as ArtifactOperation['operation'] | undefined;
    const rawPath = getAttr(opAttrs, 'path');
    const rawNewPath = getAttr(opAttrs, 'newPath') || getAttr(opAttrs, 'new_path');

    if (!opType || !rawPath) continue;

    const path = normalizeRelativePath(rawPath.trim());
    const newPath = rawNewPath ? normalizeRelativePath(rawNewPath.trim()) : undefined;
    const content = opMatch[2]?.replace(/^\r?\n/, '').replace(/\r?\n$/, '');

    if (isSafeExportPath(path)) {
      operations.push({
        operation: opType,
        path,
        newPath,
        content,
        language: inferLanguageFromPath(newPath || path),
      });
    }
  }

  if (operations.length > 0) {
    cleanText = text.replace(opRegex, '').trim();
    return {
      operations,
      cleanText,
    };
  }

  return { cleanText };
}

/**
 * Prebuilt production-grade starter templates
 */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'nextjs-portfolio',
    name: 'Next.js 15+ Portfolio',
    icon: 'Globe',
    category: 'web',
    description: 'Modern portfolio with Tailwind CSS, hero section, project showcase & contact form',
    project: {
      name: 'portfolio-website',
      title: 'Modern Developer Portfolio',
      description: 'Production-ready Next.js portfolio with responsive Tailwind styling',
      activeFilePath: 'app/page.tsx',
      files: [
        {
          path: 'app/layout.tsx',
          name: 'layout.tsx',
          language: 'tsx',
          updatedAt: Date.now(),
          content: `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Alex Rivera — Full Stack & Security Engineer',
  description: 'Crafting resilient architectures, high-performance web systems, and secure AI tools.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090b11] text-slate-100 font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
`,
        },
        {
          path: 'app/page.tsx',
          name: 'page.tsx',
          language: 'tsx',
          updatedAt: Date.now(),
          content: `import React from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Projects from '../components/Projects';
import Skills from '../components/Skills';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main className="relative min-h-screen selection:bg-indigo-500 selection:text-white">
      <Navbar />
      <Hero />
      <Projects />
      <Skills />
      <Footer />
    </main>
  );
}
`,
        },
        {
          path: 'components/Navbar.tsx',
          name: 'Navbar.tsx',
          language: 'tsx',
          updatedAt: Date.now(),
          content: `import React from 'react';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-[#090b11]/80 border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2 font-bold text-lg text-white tracking-tight">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
          Alex Rivera
        </a>
        <nav className="flex items-center gap-6 text-sm text-slate-300">
          <a href="#about" className="hover:text-white transition-colors">About</a>
          <a href="#projects" className="hover:text-white transition-colors">Projects</a>
          <a href="#skills" className="hover:text-white transition-colors">Skills</a>
          <a
            href="#contact"
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            Get in touch
          </a>
        </nav>
      </div>
    </header>
  );
}
`,
        },
        {
          path: 'components/Hero.tsx',
          name: 'Hero.tsx',
          language: 'tsx',
          updatedAt: Date.now(),
          content: `import React from 'react';

export default function Hero() {
  return (
    <section className="py-24 px-6 max-w-6xl mx-auto text-center flex flex-col items-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-6">
        ✦ Available for High-Impact Projects
      </div>
      <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-tight mb-6">
        Architecting <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-sky-400">Resilient</span> Web Systems.
      </h1>
      <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
        Specialized in Next.js, full-stack microservices, defensive cybersecurity, and intelligent agentic workflows.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <a
          href="#projects"
          className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold shadow-lg shadow-indigo-500/25 transition-all"
        >
          View Case Studies &rarr;
        </a>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="px-6 py-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-200 font-semibold transition-colors"
        >
          GitHub Profile
        </a>
      </div>
    </section>
  );
}
`,
        },
        {
          path: 'components/Projects.tsx',
          name: 'Projects.tsx',
          language: 'tsx',
          updatedAt: Date.now(),
          content: `import React from 'react';

const FEATURED_PROJECTS = [
  {
    title: 'Sentinels AI — Cyber Threat Monitor',
    description: 'Real-time telemetry and automated anomaly detection pipeline processing 50k logs/sec.',
    tags: ['Next.js', 'Python', 'WebSockets', 'Tailwind'],
  },
  {
    title: 'CloudMesh — Edge Proxy Gateway',
    description: 'Ultra-low latency reverse proxy with dynamic SSL termination and zero-trust auth.',
    tags: ['Go', 'TypeScript', 'Docker', 'Redis'],
  },
  {
    title: 'Raizel Workspace — AI Builder',
    description: 'Claude-style artifact workspace with multi-file code generator and live ZIP packaging.',
    tags: ['Next.js', 'React', 'JSZip', 'Tailwind'],
  },
];

export default function Projects() {
  return (
    <section id="projects" className="py-20 px-6 max-w-6xl mx-auto border-t border-white/[0.06]">
      <div className="mb-12">
        <h2 className="text-3xl font-bold text-white mb-2">Featured Projects</h2>
        <p className="text-slate-400 text-sm">Select work in production and open-source contributions.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURED_PROJECTS.map((p, idx) => (
          <div
            key={idx}
            className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-indigo-500/40 transition-all flex flex-col justify-between"
          >
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">{p.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">{p.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {p.tags.map((tag) => (
                <span key={tag} className="px-2.5 py-1 rounded-lg bg-white/[0.06] text-slate-300 text-xs font-mono">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
`,
        },
        {
          path: 'components/Skills.tsx',
          name: 'Skills.tsx',
          language: 'tsx',
          updatedAt: Date.now(),
          content: `import React from 'react';

export default function Skills() {
  const domains = [
    { title: 'Frontend', items: ['Next.js 15', 'React 19', 'TypeScript', 'Tailwind CSS', 'Turbopack'] },
    { title: 'Backend & Cloud', items: ['Node.js', 'Python', 'FastAPI', 'PostgreSQL', 'Docker', 'AWS'] },
    { title: 'Security & DevOps', items: ['OWASP Top 10', 'Auth0 / NextAuth', 'CI/CD Pipelines', 'Penetration Testing'] },
  ];

  return (
    <section id="skills" className="py-20 px-6 max-w-6xl mx-auto border-t border-white/[0.06]">
      <div className="mb-12">
        <h2 className="text-3xl font-bold text-white mb-2">Core Competencies</h2>
        <p className="text-slate-400 text-sm">Tools and disciplines refined over 7+ years of engineering.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {domains.map((d, i) => (
          <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <h3 className="text-base font-semibold text-indigo-400 mb-4">{d.title}</h3>
            <ul className="space-y-2 text-sm text-slate-300">
              {d.items.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/60" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
`,
        },
        {
          path: 'components/Footer.tsx',
          name: 'Footer.tsx',
          language: 'tsx',
          updatedAt: Date.now(),
          content: `import React from 'react';

export default function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-white/[0.06] text-center text-xs text-slate-500">
      <p>© {new Date().getFullYear()} Alex Rivera. Built with Next.js & RAIZEL AI.</p>
    </footer>
  );
}
`,
        },
        {
          path: 'package.json',
          name: 'package.json',
          language: 'json',
          updatedAt: Date.now(),
          content: `{
  "name": "portfolio-website",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.468.0"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}
`,
        },
        {
          path: 'README.md',
          name: 'README.md',
          language: 'markdown',
          updatedAt: Date.now(),
          content: `# Modern Developer Portfolio

A sleek, responsive portfolio template built with Next.js, React, and Tailwind CSS. Generated by **RAIZEL AI**.

## Quick Start
\`\`\`bash
# 1. Install dependencies
npm install

# 2. Run dev server
npm run dev

# 3. Open browser at http://localhost:3000
\`\`\`
`,
        },
      ],
    },
  },
  {
    id: 'cybersecurity-scanner',
    name: 'Cybersecurity Network Scanner',
    icon: 'ShieldAlert',
    category: 'cybersecurity',
    description: 'Python asynchronous port scanner and security audit reporting tool with clean CLI',
    project: {
      name: 'cyber-port-scanner',
      title: 'Defensive Network & Port Auditor',
      description: 'Async Python scanner assessing open ports, banner grabs, and security headers',
      activeFilePath: 'scanner.py',
      files: [
        {
          path: 'scanner.py',
          name: 'scanner.py',
          language: 'python',
          updatedAt: Date.now(),
          content: `#!/usr/bin/env python3
"""
Defensive Port & Service Auditor
Author: RAIZEL AI Security Suite
Notice: Only run on authorized systems and networks.
"""

import asyncio
import socket
import argparse
import sys
from typing import List, Dict, Any

COMMON_PORTS = {
    21: "FTP",
    22: "SSH",
    25: "SMTP",
    53: "DNS",
    80: "HTTP",
    110: "POP3",
    143: "IMAP",
    443: "HTTPS",
    3306: "MySQL",
    5432: "PostgreSQL",
    6379: "Redis",
    8080: "HTTP-Alt",
    8443: "HTTPS-Alt",
}

async def scan_port(host: str, port: int, timeout: float = 1.0) -> Dict[str, Any]:
    """Tests connection to host:port with banner grab."""
    service = COMMON_PORTS.get(port, "Unknown")
    result = {
        "port": port,
        "service": service,
        "open": False,
        "banner": ""
    }

    try:
        conn = asyncio.open_connection(host, port)
        reader, writer = await asyncio.wait_for(conn, timeout=timeout)
        result["open"] = True

        # Attempt safe banner grab
        try:
            writer.write(b"HEAD / HTTP/1.0\\r\\n\\r\\n")
            await writer.drain()
            banner = await asyncio.wait_for(reader.read(256), timeout=0.8)
            result["banner"] = banner.decode("utf-8", errors="ignore").strip().splitlines()[0]
        except Exception:
            pass

        writer.close()
        await writer.wait_closed()
    except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
        pass

    return result

async def run_audit(target: str, ports: List[int], concurrency: int = 50) -> List[Dict[str, Any]]:
    print(f"[*] Auditing target: {target}")
    print(f"[*] Scanning {len(ports)} ports with concurrency {concurrency}...")

    semaphore = asyncio.Semaphore(concurrency)

    async def sem_scan(p):
        async with semaphore:
            return await scan_port(target, p)

    tasks = [sem_scan(p) for p in ports]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r["open"]]

def main():
    parser = argparse.ArgumentParser(description="RAIZEL AI Defensive Port Auditor")
    parser.add_argument("target", help="Target hostname or IP (e.g. 127.0.0.1)")
    parser.add_argument("--top", action="store_true", help="Scan common top 100 ports")
    parser.add_argument("-c", "--concurrency", type=int, default=40, help="Max async workers")
    args = parser.parse_args()

    ports = list(COMMON_PORTS.keys()) if not args.top else list(range(1, 1024))
    open_ports = asyncio.run(run_audit(args.target, ports, args.concurrency))

    print("\\n[+] --- AUDIT REPORT ---")
    if not open_ports:
        print("[+] No target ports were found open.")
        return

    for item in open_ports:
        banner_info = f" | Banner: {item['banner']}" if item["banner"] else ""
        print(f"[OPEN] Port {item['port']}/tcp ({item['service']}){banner_info}")

if __name__ == "__main__":
    main()
`,
        },
        {
          path: 'requirements.txt',
          name: 'requirements.txt',
          language: 'plaintext',
          updatedAt: Date.now(),
          content: `# Pure standard library async implementation
# No third-party dependencies required for scanner.py!
`,
        },
        {
          path: 'README.md',
          name: 'README.md',
          language: 'markdown',
          updatedAt: Date.now(),
          content: `# Defensive Network & Port Auditor

A lightweight, concurrent Python network audit utility.

## Usage
\`\`\`bash
# Audit standard ports
python scanner.py 127.0.0.1

# Audit top privileged ports
python scanner.py 127.0.0.1 --top
\`\`\`

> **Security Notice**: Only scan targets you own or have explicit authorization to assess.
`,
        },
      ],
    },
  },
];

'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { ProjectTemplate } from '@/types/artifact';
import { PROJECT_TEMPLATES } from '@/lib/artifact';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  onSelectTemplate: (template: ProjectTemplate) => void;
}

const SUGGESTIONS = [
  {
    label: 'Analyse a project',
    prompt:
      'I will upload a ZIP of my project. Read it, then explain the architecture, the main data flow, and anything that looks fragile.',
  },
  {
    label: 'Plan a build',
    prompt:
      'Plan a small marketplace app: architecture, data model, and a phase-by-phase build order. Do not write code yet.',
  },
  {
    label: 'Review code',
    prompt: 'Review the file I paste for correctness, edge cases, and readability. Be specific.',
  },
  {
    label: 'Explain a concept',
    prompt: 'Explain how React Server Components change data fetching, with a concrete example.',
  },
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSelectPrompt, onSelectTemplate }) => (
  <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12">
    <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em] text-[var(--text)] sm:text-[2rem]">
      What are we building?
    </h1>
    <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-secondary)]">
      Upload a project and RAIZEL reads every file it can decode, builds an index, and keeps working
      in that codebase instead of starting over each time.
    </p>

    <div className="mt-8 grid gap-2 sm:grid-cols-2">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion.label}
          type="button"
          onClick={() => onSelectPrompt(suggestion.prompt)}
          className="group rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-raised)] p-3.5 text-left transition-colors hover:bg-[var(--fill)]"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-[var(--text)]">{suggestion.label}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="mt-1 block text-[12.5px] leading-snug text-[var(--text-muted)]">
            {suggestion.prompt.length > 96
              ? `${suggestion.prompt.slice(0, 96).trim()}…`
              : suggestion.prompt}
          </span>
        </button>
      ))}
    </div>

    <div className="mt-8">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        Start from a template
      </h2>
      <div className="flex flex-wrap gap-2">
        {PROJECT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelectTemplate(template)}
            title={template.description}
            className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--text)]"
          >
            {template.name}
          </button>
        ))}
      </div>
    </div>
  </div>
);

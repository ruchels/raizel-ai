'use client';

import React from 'react';
import {
  Code,
  ShieldAlert,
  GraduationCap,
  Rocket,
  Globe,
  Sparkles,
  FolderArchive,
  ArrowRight,
} from 'lucide-react';
import { ProjectTemplate } from '@/types/artifact';
import { PROJECT_TEMPLATES } from '@/lib/artifact';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  onSelectTemplate?: (template: ProjectTemplate) => void;
}

interface SuggestionCard {
  icon: React.ReactNode;
  label: string;
  description: string;
  prompt: string;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectPrompt,
  onSelectTemplate,
}) => {
  const suggestions: SuggestionCard[] = [
    {
      icon: <Globe className="w-5 h-5 text-indigo-400" />,
      label: 'Build Next.js Portfolio',
      description: 'Generate multi-file portfolio with navbar, hero, projects and Tailwind CSS',
      prompt: 'Build a modern and responsive portfolio website using Next.js and Tailwind with navbar, hero, projects, and footer.',
    },
    {
      icon: <Code className="w-5 h-5 text-emerald-400" />,
      label: 'Build Python CLI Tool',
      description: 'Create an asynchronous multi-file Python network security audit utility',
      prompt: 'Build a defensive Python network and port scanner tool with async sockets, banner grab, and clean CLI arguments.',
    },
    {
      icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
      label: 'Defensive Security Review',
      description: 'Analyze code vulnerabilities, OWASP Top 10 risks, and hardening',
      prompt: 'Perform a thorough defensive security audit on a full-stack application and provide remediation code for OWASP Top 10 risks.',
    },
    {
      icon: <Rocket className="w-5 h-5 text-purple-400" />,
      label: 'Full-Stack React App',
      description: 'Scaffold interactive dashboard with charts, stats cards, and modern UI',
      prompt: 'Build a modern SaaS Analytics Dashboard application in React with stats cards, revenue charts, and clean component architecture.',
    },
    {
      icon: <GraduationCap className="w-5 h-5 text-sky-400" />,
      label: 'Explain Complex Code',
      description: 'Deep dive into algorithmic complexity, design patterns & concurrency',
      prompt: 'Explain asynchronous event loops, promises, and non-blocking I/O with intuitive diagrams and code examples.',
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full text-center select-none animate-in fade-in duration-300">
      {/* Brand Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs text-indigo-300 font-medium mb-6 shadow-inner">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
        <span>Next-Gen Multi-Model AI Hub</span>
      </div>

      {/* Hero Title */}
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-3">
        RAIZEL <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-sky-400">AI</span>
      </h1>

      {/* Tagline */}
      <p className="text-base sm:text-lg text-slate-300 font-medium mb-2">
        &ldquo;Your AI. Your Ideas. Your Power.&rdquo;
      </p>
      <p className="text-sm text-slate-400 max-w-md mx-auto mb-10">
        What can I help you build today?
      </p>

      {/* Starter Templates Section */}
      {onSelectTemplate && (
        <div className="w-full mb-8 text-left">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
              <span>Project Starter Templates</span>
            </h3>
            <span className="text-[11px] text-indigo-400/80">Click to open & inspect workspace</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {PROJECT_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => onSelectTemplate(tmpl)}
                className="group p-4 rounded-2xl bg-gradient-to-r from-indigo-950/20 via-white/[0.03] to-purple-950/20 hover:bg-white/[0.06] border border-indigo-500/20 hover:border-indigo-400/50 transition-all text-left cursor-pointer flex items-center justify-between shadow-lg shadow-indigo-950/10"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 group-hover:scale-105 transition-transform">
                    <FolderArchive className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                      {tmpl.name}
                    </div>
                    <div className="text-xs text-slate-400 line-clamp-1">
                      {tmpl.description}
                    </div>
                    <div className="text-[10px] text-indigo-400 font-mono mt-0.5">
                      {tmpl.project.files.length} files • Ready to package
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions Grid */}
      <div className="w-full text-left mb-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
          Prompts & Workflows
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 w-full text-left">
        {suggestions.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectPrompt(item.prompt)}
            className="group relative p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] hover:border-indigo-500/40 transition-all duration-200 text-left cursor-pointer flex flex-col justify-between hover:shadow-xl hover:shadow-indigo-950/20"
          >
            <div>
              <div className="p-2 w-fit rounded-xl bg-white/[0.05] border border-white/10 mb-3 group-hover:scale-110 transition-transform duration-200">
                {item.icon}
              </div>
              <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                {item.label}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                {item.description}
              </p>
            </div>
            <span className="mt-3 text-[11px] font-medium text-indigo-400/80 group-hover:text-indigo-300 flex items-center gap-1 opacity-80 group-hover:opacity-100">
              Start prompt &rarr;
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

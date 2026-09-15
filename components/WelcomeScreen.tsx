'use client';

import React from 'react';
import {
  Code,
  ShieldAlert,
  GraduationCap,
  Rocket,
  Globe,
  Sparkles,
} from 'lucide-react';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
}

interface SuggestionCard {
  icon: React.ReactNode;
  label: string;
  description: string;
  prompt: string;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectPrompt,
}) => {
  const suggestions: SuggestionCard[] = [
    {
      icon: <Globe className="w-5 h-5 text-indigo-400" />,
      label: 'Build a website',
      description: 'Design and code a modern, high-converting landing page',
      prompt: 'Build a modern and responsive portfolio landing page with clean HTML, Tailwind CSS, and interactive components.',
    },
    {
      icon: <Code className="w-5 h-5 text-emerald-400" />,
      label: 'Write Python code',
      description: 'Create automated scripts, algorithms, or API backends',
      prompt: 'Write an asynchronous Python script that fetches data from an API, processes the JSON, and saves the summary into a database.',
    },
    {
      icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
      label: 'Learn cybersecurity',
      description: 'Explore web security, OWASP top 10, and defense techniques',
      prompt: 'Explain the OWASP Top 10 vulnerabilities with real-world exploit examples and how developers can remediate them.',
    },
    {
      icon: <GraduationCap className="w-5 h-5 text-sky-400" />,
      label: 'Help with my homework',
      description: 'Break down complex math, science, or literature questions',
      prompt: 'Help me understand calculus integration by parts step-by-step with intuitive analogies and practice problems.',
    },
    {
      icon: <Rocket className="w-5 h-5 text-purple-400" />,
      label: 'Build my next project',
      description: 'Brainstorm scalable architecture, tech stack & roadmaps',
      prompt: 'Give me a full architectural design, tech stack recommendation, and 4-week roadmap for a production-ready AI SaaS application.',
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

      {/* Suggestions Grid */}
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

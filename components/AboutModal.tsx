'use client';

import React from 'react';
import { X, Sparkles, ShieldCheck, Cpu, Terminal } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-3xl bg-[#0d101a] border border-white/10 shadow-2xl shadow-black/90 p-6 text-slate-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 mx-auto flex items-center justify-center mb-3 shadow-lg shadow-indigo-600/30">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-extrabold text-white">RAIZEL AI</h3>
          <p className="text-xs text-indigo-400 font-medium mt-1">
            &ldquo;Your AI. Your Ideas. Your Power.&rdquo;
          </p>
        </div>

        <div className="space-y-3 text-xs leading-relaxed text-slate-300 mb-6">
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-start gap-3">
            <Cpu className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Multi-Model Gateway</span>
              <p className="text-slate-400 mt-0.5">
                Switch effortlessly between Claude Opus, Sonnet, Haiku, Grok, DeepSeek, Kimi, and GLM models.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-start gap-3">
            <Terminal className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Rindri AI Gateway</span>
              <p className="text-slate-400 mt-0.5">
                Powered by Rindri AI endpoint architecture with high-speed response routing.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Zero-Exposure Security</span>
              <p className="text-slate-400 mt-0.5">
                API keys are never transmitted to the browser. All inferences run through Next.js server route handlers.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center pt-3 border-t border-white/[0.08] text-[11px] text-slate-500">
          RAIZEL AI &bull; Version 1.0.0
        </div>
      </div>
    </div>
  );
};

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Sparkles, Check, Cpu, Zap, Code2, Bot } from 'lucide-react';
import { AVAILABLE_MODELS, PROVIDERS } from '@/lib/models';
import { ModelInfo, ModelProvider } from '@/types/chat';

interface ModelSelectorProps {
  currentModelId: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModelId,
  onSelectModel,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentModel =
    AVAILABLE_MODELS.find((m) => m.id === currentModelId) ||
    AVAILABLE_MODELS[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getProviderIcon = (provider: ModelProvider) => {
    switch (provider) {
      case 'Claude':
        return <Sparkles className="w-3.5 h-3.5 text-amber-400" />;
      case 'Grok':
        return <Zap className="w-3.5 h-3.5 text-sky-400" />;
      case 'DeepSeek':
        return <Code2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'Kimi':
        return <Cpu className="w-3.5 h-3.5 text-indigo-400" />;
      case 'GLM':
        return <Bot className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-sm text-slate-200 font-medium transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
        aria-label="Select AI Model"
      >
        <span className="flex items-center gap-1.5">
          {getProviderIcon(currentModel.provider)}
          <span className="font-semibold text-white">{currentModel.name}</span>
        </span>
        {currentModel.badge && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
            {currentModel.badge}
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 group-hover:text-slate-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 sm:w-80 max-h-[75vh] overflow-y-auto rounded-2xl bg-[#0e121d] border border-white/10 shadow-2xl shadow-black/80 z-50 p-2 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-2 border-b border-white/[0.06] mb-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Select AI Engine
            </span>
          </div>

          <div className="space-y-3 py-1">
            {PROVIDERS.map((provider) => {
              const models = AVAILABLE_MODELS.filter(
                (m) => m.provider === provider
              );
              if (models.length === 0) return null;

              return (
                <div key={provider} className="space-y-1">
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {getProviderIcon(provider)}
                    <span>{provider}</span>
                  </div>

                  <div className="space-y-0.5">
                    {models.map((model: ModelInfo) => {
                      const isSelected = model.id === currentModelId;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => {
                            onSelectModel(model.id);
                            setIsOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-sm transition-all duration-150 cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600/20 text-white border border-indigo-500/40'
                              : 'text-slate-300 hover:bg-white/[0.06] hover:text-white border border-transparent'
                          }`}
                        >
                          <div className="flex-1 pr-2 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium truncate ${
                                  isSelected ? 'text-indigo-200' : 'text-slate-200'
                                }`}
                              >
                                {model.name}
                              </span>
                              {model.badge && (
                                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-white/10 text-slate-300 font-semibold">
                                  {model.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {model.description}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

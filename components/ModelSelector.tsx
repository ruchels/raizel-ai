'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { AVAILABLE_MODELS, getModelInfo } from '@/lib/models';
import type { ModelInfo } from '@/types/chat';
import { cx } from './ui/primitives';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = getModelInfo(value);

  const groups = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const model of AVAILABLE_MODELS) {
      const key = model.family || model.provider;
      const list = map.get(key) ?? [];
      list.push(model);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cx(
          'inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] px-2.5 text-[13px] font-medium',
          'text-[var(--text)] hover:bg-[var(--fill)] transition-colors',
          'disabled:opacity-50 disabled:pointer-events-none',
          open && 'bg-[var(--fill)]'
        )}
      >
        <span className="truncate max-w-[9rem] sm:max-w-none">
          {current?.name ?? 'Select model'}
        </span>
        <ChevronDown
          className={cx('h-3.5 w-3.5 text-[var(--text-muted)] transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-40 mt-1.5 max-h-[min(70dvh,28rem)] w-[min(92vw,20rem)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-raised)] py-1 shadow-[var(--shadow-lg)] animate-fade-in"
        >
          {groups.map(([family, models]) => (
            <div key={family}>
              <p className="px-3 pb-1 pt-2 text-[11px] font-medium text-[var(--text-muted)]">
                {family}
              </p>
              {models.map((model) => {
                const selected = model.id === value;
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                    className={cx(
                      'flex w-full items-start gap-2.5 px-3 py-1.5 text-left transition-colors',
                      selected ? 'bg-[var(--fill)]' : 'hover:bg-[var(--fill)]'
                    )}
                  >
                    <Check
                      className={cx(
                        'mt-0.5 h-3.5 w-3.5 shrink-0',
                        selected ? 'text-[var(--accent-text)]' : 'opacity-0'
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-[var(--text)]">{model.name}</span>
                        {model.badge && (
                          <span className="rounded-[var(--radius-sm)] bg-[var(--fill)] px-1 py-px text-[10px] text-[var(--text-muted)]">
                            {model.badge}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-[var(--text-muted)]">
                        {model.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

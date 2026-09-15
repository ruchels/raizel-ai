'use client';

import React from 'react';
import { X, Moon, Sun, Monitor, Check, Sliders, ShieldCheck } from 'lucide-react';
import { UserSettings } from '@/types/chat';
import { AVAILABLE_MODELS } from '@/lib/models';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSaveSettings: (settings: UserSettings) => void;
  onClearAllChats: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onClearAllChats,
}) => {
  if (!isOpen) return null;

  const updateSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    onSaveSettings({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0e121d] border border-white/10 shadow-2xl shadow-black/90 p-5 sm:p-6 text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Settings</h2>
              <p className="text-xs text-slate-400">Manage your RAIZEL AI workspace preferences</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-1">
          {/* Appearance */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2.5">
              Appearance
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
                { id: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
                { id: 'system', label: 'System', icon: <Monitor className="w-4 h-4" /> },
              ].map((theme) => {
                const isSelected = settings.theme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => updateSetting('theme', theme.id as 'dark' | 'light' | 'system')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                        : 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    {theme.icon}
                    <span>{theme.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat Preferences */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2.5">
              Chat Controls
            </label>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors">
                <div>
                  <div className="text-sm font-medium text-slate-200">Enter to send</div>
                  <div className="text-xs text-slate-400">Press Enter to send, Shift+Enter for new line</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enterToSend}
                  onChange={(e) => updateSetting('enterToSend', e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 text-indigo-600 focus:ring-indigo-500 bg-black/40 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors">
                <div>
                  <div className="text-sm font-medium text-slate-200">Show timestamps</div>
                  <div className="text-xs text-slate-400">Display timestamp on assistant messages</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showTimestamps}
                  onChange={(e) => updateSetting('showTimestamps', e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 text-indigo-600 focus:ring-indigo-500 bg-black/40 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors">
                <div>
                  <div className="text-sm font-medium text-slate-200">Save chat history</div>
                  <div className="text-xs text-slate-400">Store conversations in your local browser storage</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.saveHistory}
                  onChange={(e) => updateSetting('saveHistory', e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 text-indigo-600 focus:ring-indigo-500 bg-black/40 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Default Model */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Default AI Model
            </label>
            <select
              value={settings.defaultModel}
              onChange={(e) => updateSetting('defaultModel', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#0e121d] text-slate-200">
                  {m.provider} - {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Security Notice */}
          <div className="p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 flex gap-3 text-xs text-indigo-200">
            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-indigo-300">Server-Side Security Active</span>
              <p className="text-indigo-300/80 mt-0.5">
                API credentials are strictly preserved on the server via <code className="bg-black/30 px-1 py-0.5 rounded text-indigo-200">.env.local</code>. No keys are ever exposed to the client.
              </p>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="pt-2 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Are you sure you want to clear all chat history?')) {
                  onClearAllChats();
                  onClose();
                }
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Clear All Conversations
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-white/[0.08] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/30 transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

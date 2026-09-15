import { ModelInfo, ModelProvider } from '@/types/chat';

export const DEFAULT_MODEL_ID = 'claude-opus-5';

export const AVAILABLE_MODELS: ModelInfo[] = [
  // CLAUDE OPUS
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    provider: 'Claude',
    family: 'Claude Opus',
    description: 'Most powerful model for complex reasoning, code, and creative tasks',
    badge: 'Flagship',
    isDefault: true,
  },
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    provider: 'Claude',
    family: 'Claude Opus',
    description: 'High-intelligence reasoning and multi-step problem solving',
  },
  {
    id: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    provider: 'Claude',
    family: 'Claude Opus',
    description: 'Advanced comprehension and deep technical capabilities',
  },
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'Claude',
    family: 'Claude Opus',
    description: 'Balanced power and reliable execution for complex queries',
  },
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'Claude',
    family: 'Claude Opus',
    description: 'Original Opus architecture for detailed analytical work',
  },

  // CLAUDE SONNET
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'Claude',
    family: 'Claude Sonnet',
    description: 'Speed and high capability blend for daily coding & chat',
    badge: 'Popular',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'Claude',
    family: 'Claude Sonnet',
    description: 'High throughput with strong analytical depth',
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'Claude',
    family: 'Claude Sonnet',
    description: 'Fast, dependable companion for multi-turn development',
  },

  // CLAUDE HAIKU
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'Claude',
    family: 'Claude Haiku',
    description: 'Ultra-fast lightweight responses for rapid interactions',
    badge: 'Fast',
  },

  // GROK
  {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    provider: 'Grok',
    family: 'Grok',
    description: 'Direct, witty reasoning with broad world understanding',
    badge: 'New',
  },
  {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    provider: 'Grok',
    family: 'Grok',
    description: 'Balanced intelligence and quick comprehension',
  },
  {
    id: 'grok4-3',
    name: 'Grok 4.3',
    provider: 'Grok',
    family: 'Grok',
    description: 'Lightweight conversational engine',
  },

  // DEEPSEEK
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    family: 'DeepSeek',
    description: 'Deep mathematical, algorithmic and programming mastery',
    badge: 'Coding',
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
    family: 'DeepSeek',
    description: 'High-speed code completion and lightning queries',
    badge: 'Fast',
  },

  // KIMI
  {
    id: 'kimi-k3',
    name: 'Kimi K3',
    provider: 'Kimi',
    family: 'Kimi',
    description: 'Large context window with superior document understanding',
  },
  {
    id: 'kimi-k2.7-code',
    name: 'Kimi K2.7 Code',
    provider: 'Kimi',
    family: 'Kimi',
    description: 'Specialized for multi-file code generation and debugging',
    badge: 'Dev',
  },

  // GLM
  {
    id: 'glm-5.3',
    name: 'GLM 5.3',
    provider: 'GLM',
    family: 'GLM',
    description: 'Bilingual conversational and reasoning architecture',
  },
];

export const MODEL_WHITELIST: Set<string> = new Set(
  AVAILABLE_MODELS.map((m) => m.id)
);

export function isValidModel(modelId: string): boolean {
  return MODEL_WHITELIST.has(modelId);
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === modelId);
}

export const PROVIDERS: ModelProvider[] = [
  'Claude',
  'Grok',
  'DeepSeek',
  'Kimi',
  'GLM',
];

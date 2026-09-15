import OpenAI from 'openai';

/**
 * Normalizes the base URL for the Rindri OpenAI-compatible gateway.
 * Defaults to 'https://api.rindri.com/v1' if not provided or if base doesn't include /v1.
 */
export function getRindriBaseUrl(): string {
  const rawUrl = process.env.RINDRI_BASE_URL?.trim() || 'https://api.rindri.com';
  // Remove trailing slash if present
  const cleaned = rawUrl.replace(/\/+$/, '');
  // If it already ends with /v1, keep it; otherwise append /v1
  if (cleaned.endsWith('/v1')) {
    return cleaned;
  }
  return `${cleaned}/v1`;
}

/**
 * Returns the secret Rindri API key from server environment.
 * NEVER exposed to client.
 */
export function getRindriApiKey(): string {
  return process.env.RINDRI_API_KEY?.trim() || '';
}

/**
 * Creates an OpenAI client configured for the Rindri gateway.
 */
export function createRindriClient(): OpenAI {
  const apiKey = getRindriApiKey();
  const baseURL = getRindriBaseUrl();

  return new OpenAI({
    apiKey: apiKey || 'dummy-key-for-client-init',
    baseURL,
    timeout: 180000,
  });
}

/**
 * Maps error status codes and messages to user-friendly, safe error descriptions.
 * Never leaks server secrets or internal tokens.
 */
export function mapProviderError(error: unknown): {
  status: number;
  userMessage: string;
} {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    const status = typeof errObj.status === 'number' ? errObj.status : 500;

    if (status === 401) {
      return {
        status: 401,
        userMessage:
          'API key is missing or invalid. Please check your RINDRI_API_KEY in .env.local on the server.',
      };
    }

    if (status === 403) {
      return {
        status: 403,
        userMessage:
          'Access forbidden. Your Rindri account or API key does not have permission to use this model.',
      };
    }

    if (status === 429) {
      return {
        status: 429,
        userMessage:
          'The AI provider is temporarily rate-limited. Please try again in a moment.',
      };
    }

    if (status === 400) {
      return {
        status: 400,
        userMessage:
          'Invalid request parameters. Please verify your prompt or switch to another model.',
      };
    }

    if (status >= 500 && status < 600) {
      return {
        status,
        userMessage:
          'Something went wrong. RAIZEL AI couldn\'t connect to the AI provider. (Provider Error)',
      };
    }

    const message = typeof errObj.message === 'string' ? errObj.message : '';
    if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('fetch failed') || message.toLowerCase().includes('econnrefused')) {
      return {
        status: 504,
        userMessage:
          'Something went wrong. RAIZEL AI couldn\'t connect to the AI provider. Connection timed out.',
      };
    }
  }

  return {
    status: 500,
    userMessage:
      'Something went wrong. RAIZEL AI couldn\'t connect to the AI provider.',
  };
}

/**
 * Single shared secret detector.
 *
 * Used in three places, all of which must agree:
 *  1. ZIP export      — redact before packaging
 *  2. Memory writes   — never persist a credential to long-term memory
 *  3. Project context — flag (not redact) so the model can warn the user
 */

export interface SecretPattern {
  pattern: RegExp;
  label: string;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  {
    pattern:
      /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE KEY-----[\s\S]*?-----END (?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE KEY-----/g,
    label: 'Private key',
  },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS access key ID' },
  { pattern: /\bASIA[0-9A-Z]{16}\b/g, label: 'AWS temporary key ID' },
  { pattern: /\bghp_[A-Za-z0-9]{36}\b/g, label: 'GitHub personal access token' },
  { pattern: /\bgho_[A-Za-z0-9]{36}\b/g, label: 'GitHub OAuth token' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g, label: 'GitHub fine-grained PAT' },
  { pattern: /\bsk-(?:proj-|live-|test-|ant-)?[A-Za-z0-9_-]{24,}\b/g, label: 'Provider secret key' },
  { pattern: /\b(?:rindri|rnd)_[A-Za-z0-9]{16,}\b/gi, label: 'Rindri API token' },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: 'Slack token' },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, label: 'Google API key' },
  { pattern: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, label: 'JWT' },
  {
    pattern:
      /\b(?:api[_-]?key|apikey|secret[_-]?key|private[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/gi,
    label: 'Hardcoded credential',
  },
  { pattern: /\b(?:\d[ -]?){13,19}\b(?=[^\d]|$)/g, label: 'Possible card number' },
];

export const REDACTION_PLACEHOLDER = '[REDACTED_BY_RAIZEL]';

export interface SecretScanResult {
  found: boolean;
  labels: string[];
}

/** Detects secrets without modifying the input. */
export function scanForSecrets(text: string): SecretScanResult {
  if (!text) return { found: false, labels: [] };
  const labels = new Set<string>();

  for (const { pattern, label } of SECRET_PATTERNS) {
    // Card-number matching is noisy; require a credential-ish context word.
    if (label === 'Possible card number' && !/\b(card|credit|cvv|visa|mastercard)\b/i.test(text)) {
      continue;
    }
    pattern.lastIndex = 0;
    if (pattern.test(text)) labels.add(label);
    pattern.lastIndex = 0;
  }

  return { found: labels.size > 0, labels: Array.from(labels) };
}

export interface RedactionResult {
  text: string;
  redacted: boolean;
  labels: string[];
}

export function redactSecrets(text: string, context = ''): RedactionResult {
  if (!text) return { text: '', redacted: false, labels: [] };

  let output = text;
  let redacted = false;
  const labels = new Set<string>();

  for (const { pattern, label } of SECRET_PATTERNS) {
    if (label === 'Possible card number' && !/\b(card|credit|cvv|visa|mastercard)\b/i.test(text)) {
      continue;
    }
    pattern.lastIndex = 0;
    if (!pattern.test(output)) {
      pattern.lastIndex = 0;
      continue;
    }
    pattern.lastIndex = 0;
    redacted = true;
    labels.add(label);
    output = output.replace(pattern, (match) =>
      match.startsWith('-----BEGIN')
        ? `-----BEGIN PRIVATE KEY-----\n${REDACTION_PLACEHOLDER}\n-----END PRIVATE KEY-----`
        : REDACTION_PLACEHOLDER
    );
  }

  if (redacted && context) {
    // Caller can log this; we do not mutate the output with noise.
  }

  return { text: output, redacted, labels: Array.from(labels) };
}

/**
 * Hard gate for long-term memory. Returns true when the text must never be
 * persisted, regardless of how the user phrased the request.
 */
export function isUnsafeForMemory(text: string): { unsafe: boolean; reason?: string } {
  const scan = scanForSecrets(text);
  if (scan.found) {
    return { unsafe: true, reason: `contains what looks like a ${scan.labels[0].toLowerCase()}` };
  }

  // Phrases that signal a credential even when the value does not match a known shape.
  if (/\b(my|the)\s+(password|passphrase|pin|otp|seed phrase|recovery phrase)\s+(is|=|:)/i.test(text)) {
    return { unsafe: true, reason: 'contains a password or passphrase' };
  }
  if (/\b(seed|recovery|mnemonic)\s+phrase\b/i.test(text)) {
    return { unsafe: true, reason: 'contains a wallet recovery phrase' };
  }

  return { unsafe: false };
}

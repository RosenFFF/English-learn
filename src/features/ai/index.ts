/**
 * LLM calls (30s timeout, at most 2 retries with backoff, cancellation)
 * will live in this feature. This module must not read the API key itself;
 * settings code passes it in from src/lib/secure-store.
 */
export const aiPlaceholder = {
  title: '讲解',
  body: 'AI 讲解将在后续版本接入。',
} as const;

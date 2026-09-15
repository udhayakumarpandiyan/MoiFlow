/**
 * AI API client.
 *
 * The mobile app never holds the Sarvam (or any AI provider) key. All AI runs
 * on the backend behind these authenticated endpoints. Every method degrades
 * gracefully: the backend returns { available: false, ... } when AI is off, and
 * network errors are surfaced to the caller to handle (offline-first UX).
 */

import { apiRequest } from './ApiClient';

export interface AiExtractionResult {
  available: boolean;
  parsed: Record<string, unknown> | null;
}

export interface AiSummaryResult {
  available: boolean;
  summary: string | null;
}

export interface AiGrowthResult {
  available: boolean;
  analysis: Record<string, unknown> | null;
}

export interface AiSuggestionsResult {
  available: boolean;
  suggestions: string[];
}

function postText<T>(path: string, text: string): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: JSON.stringify({ text }) }, true);
}

function postContext<T>(
  path: string,
  context: Record<string, unknown>,
  domain: 'moi' | 'finance' | 'common',
): Promise<T> {
  return apiRequest<T>(
    path,
    { method: 'POST', body: JSON.stringify({ context, domain }) },
    true,
  );
}

/** Extract a structured Moi entry from Tamil/English text (backend AI). */
export const aiExtractMoiEntry = (text: string) =>
  postText<AiExtractionResult>('/api/ai/moi/extract', text);

/** Extract a structured finance transaction from Tamil/English text. */
export const aiExtractFinanceTxn = (text: string) =>
  postText<AiExtractionResult>('/api/ai/finance/extract', text);

/** Interpret a free-text request (intent + entities). */
export const aiUnderstand = (text: string) =>
  postText<AiExtractionResult>('/api/ai/understand', text);

/** Natural-language summary of structured figures. */
export const aiSummary = (
  context: Record<string, unknown>,
  domain: 'moi' | 'finance' | 'common' = 'finance',
) => postContext<AiSummaryResult>('/api/ai/summary', context, domain);

/** Growth / downfall analysis over period figures. */
export const aiGrowth = (
  context: Record<string, unknown>,
  domain: 'moi' | 'finance' | 'common' = 'finance',
) => postContext<AiGrowthResult>('/api/ai/growth', context, domain);

/** Actionable money suggestions from a finance summary. */
export const aiSuggestions = (
  context: Record<string, unknown>,
  domain: 'moi' | 'finance' | 'common' = 'finance',
) => postContext<AiSuggestionsResult>('/api/ai/suggestions', context, domain);

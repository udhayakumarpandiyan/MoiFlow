import { entryService } from '@common/di/container';
import type { MoiEvent } from '@moi/models/Event';
import type { Entry } from '@moi/models/Entry';

/**
 * A "What should I give?" suggestion for an event you're attending.
 *
 * Social convention for moi/gift-giving is reciprocity: you give back at least
 * what the host previously gave you, usually rounded up a little. This service
 * derives a suggested amount from the host's past IN contributions to your own
 * events, with graceful fallbacks when there's no history.
 */
export interface GiftSuggestion {
  /** Suggested cash amount in INR (0 when unknown). */
  suggestedCash: number;
  /** Suggested gold in grams (0 when unknown). */
  suggestedGold: number;
  /** How the suggestion was derived — drives the UI copy. */
  basis: 'reciprocal' | 'average_given' | 'none';
  /** What this person previously gave you (IN), for context. */
  previouslyReceivedCash: number;
  previouslyReceivedGold: number;
  /** Number of past interactions considered. */
  historyCount: number;
}

const EMPTY: GiftSuggestion = {
  suggestedCash: 0,
  suggestedGold: 0,
  basis: 'none',
  previouslyReceivedCash: 0,
  previouslyReceivedGold: 0,
  historyCount: 0,
};

/** Round a cash amount up to a "gift-friendly" step (nearest ₹100, min ₹100). */
function roundGiftCash(amount: number): number {
  if (amount <= 0) return 0;
  const step = 100;
  return Math.max(step, Math.ceil(amount / step) * step);
}

/** Case-insensitive name match. */
function nameMatches(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

class GiftSuggestionService {
  /**
   * Compute a gift suggestion for an event. Best for `OTHER_PERSON` events
   * (ones you attend and give at). Returns a 'none' suggestion when there's no
   * usable history so callers can hide or soften the hint.
   */
  async suggestForEvent(event: MoiEvent): Promise<GiftSuggestion> {
    // We can only reason about a specific person's reciprocity.
    const host = event.personName?.trim();
    if (!host) {
      return this.averageGivenFallback();
    }

    let entries: Entry[];
    try {
      // Pull everything for this person (both IN they gave us and OUT we gave).
      entries = await entryService.searchEntries(host);
    } catch {
      return EMPTY;
    }

    const forPerson = entries.filter(e => nameMatches(e.personName, host));

    // What this person gave US (IN = OWN_EVENT). This is the reciprocity basis.
    const received = forPerson.filter(e => e.entryType === 'OWN_EVENT');
    const receivedCash = sum(received, e => e.cashAmount);
    const receivedGold = sum(received, e => e.goldWeight);

    if (received.length > 0 && (receivedCash > 0 || receivedGold > 0)) {
      return {
        suggestedCash: roundGiftCash(receivedCash),
        // Match gold as-is (rounding grams isn't conventional).
        suggestedGold: receivedGold > 0 ? Number(receivedGold.toFixed(2)) : 0,
        basis: 'reciprocal',
        previouslyReceivedCash: receivedCash,
        previouslyReceivedGold: receivedGold,
        historyCount: received.length,
      };
    }

    // No direct reciprocity history → fall back to your typical giving amount.
    return this.averageGivenFallback();
  }

  /**
   * Fallback: suggest the user's typical OUT (given) cash amount so the hint is
   * still useful for a brand-new relationship.
   */
  private async averageGivenFallback(): Promise<GiftSuggestion> {
    try {
      const all = await entryService.getEntries({ entryType: 'OTHER_EVENT' });
      const given = all.filter(e => e.cashAmount > 0);
      if (given.length === 0) return EMPTY;
      const avg = sum(given, e => e.cashAmount) / given.length;
      return {
        suggestedCash: roundGiftCash(avg),
        suggestedGold: 0,
        basis: 'average_given',
        previouslyReceivedCash: 0,
        previouslyReceivedGold: 0,
        historyCount: given.length,
      };
    } catch {
      return EMPTY;
    }
  }
}

function sum(entries: Entry[], pick: (e: Entry) => number): number {
  return entries.reduce((acc, e) => acc + (Number(pick(e)) || 0), 0);
}

export const giftSuggestionService = new GiftSuggestionService();

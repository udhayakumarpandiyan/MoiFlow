import { TamilSpeechRecognizer } from './TamilSpeechRecognizer';
import { getDB } from '@common/database/db';
import { assertPremiumFeature } from '@common/subscription/featureGuard';
import { PremiumFeature } from '@common/subscription/subscriptionConfig';

/**
 * Voice Search Service for Dashboard.
 *
 * Handles:
 * 1. Speech recognition (Tamil + English via TamilSpeechRecognizer)
 * 2. Intent parsing from recognized text (local regex-based)
 * 3. SQL queries against the local SQLite database
 * 4. Generating a human-readable summary response
 */

export interface VoiceSearchResult {
  query: string;
  answer: string;
  /** Raw data used to compose the answer */
  data?: Record<string, any>;
}

type SearchIntent =
  | { type: 'total_cash_received' }
  | { type: 'total_cash_given' }
  | { type: 'total_cash_to_receive' }
  | { type: 'total_cash_to_give' }
  | { type: 'total_gold_received' }
  | { type: 'total_gold_given' }
  | { type: 'person_balance'; personName: string }
  | { type: 'person_event_contribution'; personName: string; eventName: string }
  | { type: 'event_total'; eventName: string }
  | { type: 'event_expense_estimate'; eventType: string }
  | { type: 'today_summary' }
  | { type: 'overall_summary' }
  | { type: 'unknown' };

export class VoiceSearchService {
  private _recognizer: TamilSpeechRecognizer | null = null;

  private get recognizer(): TamilSpeechRecognizer {
    if (!this._recognizer) {
      this._recognizer = new TamilSpeechRecognizer();
    }
    return this._recognizer;
  }

  static isAvailable(): boolean {
    return TamilSpeechRecognizer.isAvailable();
  }

  /**
   * Start listening for speech. Supports Tamil (ta-IN) and English (en-IN).
   */
  async startListening(
    locale: string,
    onResult: (text: string) => void,
    onError?: (error: string) => void,
  ): Promise<void> {
    // Voice search is a Premium feature — enforce beyond the UI.
    assertPremiumFeature(PremiumFeature.VoiceSearch);
    this.recognizer.onResult((text) => {
      onResult(text);
    });
    this.recognizer.onError((err) => {
      onError?.(typeof err === 'string' ? err : err?.message ?? 'Speech error');
    });
    await this.recognizer.start(locale);
  }

  async stopListening(): Promise<void> {
    await this.recognizer.stop();
  }

  /**
   * Process a voice query and return a human-readable answer.
   */
  async processQuery(text: string, lang: 'en' | 'ta' = 'en'): Promise<VoiceSearchResult> {
    const intent = this.parseIntent(text);
    const answer = await this.executeIntent(intent, lang);
    return { query: text, answer: answer.answer, data: answer.data };
  }

  /**
   * Parse intent from recognized text (supports both Tamil and English).
   */
  private parseIntent(text: string): SearchIntent {
    const lower = text.toLowerCase().trim();

    // --- Event expense estimate (e.g. "expected expenses for a wedding") ---
    if (
      this.matchesAny(lower, [
        'expense', 'expenses', 'cost', 'budget', 'spend', 'spending',
        'செலவு', 'செலவுகள்', 'மதிப்பீடு', 'பட்ஜெட்',
      ]) &&
      this.matchesAny(lower, [
        'wedding', 'marriage', 'birthday', 'housewarming', 'ear piercing', 'function', 'event',
        'திருமணம்', 'கல்யாணம்', 'பிறந்தநாள்', 'புதுமனை', 'காதணி', 'நிகழ்வு', 'விழா',
      ])
    ) {
      const eventType = this.detectEventType(lower);
      return { type: 'event_expense_estimate', eventType };
    }

    // --- Overall summary ("summary", "overview", "how am i doing") ---
    if (
      this.matchesAny(lower, [
        'summary', 'overview', 'overall', 'total summary', 'my account', 'how am i doing',
        'மொத்த சுருக்கம்', 'சுருக்கம்', 'மொத்த கணக்கு', 'ஒட்டுமொத்த',
      ])
    ) {
      return { type: 'overall_summary' };
    }

    // --- Total cash to receive ---
    if (
      this.matchesAny(lower, [
        'total cash to be received',
        'total cash to receive',
        'how much cash to receive',
        'cash receivable',
        'total receivable',
        'பெற வேண்டிய',
        'பெறவேண்டிய',
        'மொத்த பெறவேண்டிய',
        'எவ்வளவு பெற வேண்டியது',
        'எவ்வளவு வரவேண்டும்',
      ])
    ) {
      return { type: 'total_cash_to_receive' };
    }

    // --- Total cash to give ---
    if (
      this.matchesAny(lower, [
        'total cash to give',
        'total cash to be given',
        'how much to give',
        'cash payable',
        'total payable',
        'கொடுக்க வேண்டிய',
        'கொடுக்கவேண்டிய',
        'மொத்த கொடுக்கவேண்டிய',
        'எவ்வளவு கொடுக்க வேண்டியது',
      ])
    ) {
      return { type: 'total_cash_to_give' };
    }

    // --- Total cash received ---
    if (
      this.matchesAny(lower, [
        'total cash received',
        'total received',
        'how much received',
        'how much i received',
        'மொத்தம் பெற்றது',
        'மொத்த வரவு',
        'எவ்வளவு பெற்றது',
        'total income',
      ])
    ) {
      return { type: 'total_cash_received' };
    }

    // --- Total cash given ---
    if (
      this.matchesAny(lower, [
        'total cash given',
        'total given',
        'how much given',
        'how much i gave',
        'how much i given',
        'மொத்தம் கொடுத்தது',
        'மொத்த செலவு',
        'எவ்வளவு கொடுத்தது',
        'total expense',
      ])
    ) {
      return { type: 'total_cash_given' };
    }

    // --- Total gold received ---
    if (
      this.matchesAny(lower, [
        'total gold received',
        'gold received',
        'மொத்த தங்கம் பெற்றது',
        'தங்கம் எவ்வளவு பெற்றது',
      ])
    ) {
      return { type: 'total_gold_received' };
    }

    // --- Total gold given ---
    if (
      this.matchesAny(lower, [
        'total gold given',
        'gold given',
        'மொத்த தங்கம் கொடுத்தது',
        'தங்கம் எவ்வளவு கொடுத்தது',
      ])
    ) {
      return { type: 'total_gold_given' };
    }

    // --- Today summary ---
    if (
      this.matchesAny(lower, [
        'today',
        "today's summary",
        "what happened today",
        'இன்று',
        'இன்றைய',
        'இன்றைக்கு',
      ])
    ) {
      return { type: 'today_summary' };
    }

    // --- Person + event contribution ---
    // English: "How much [person] has given to me for my [event]?"
    // Tamil: "[person] என் [event]க்கு எவ்வளவு கொடுத்தார்?"
    const personEventEn = lower.match(
      /(?:how much|what).*?(?:did\s+)?(.+?)(?:\s+(?:has|have))?\s+(?:give|given|gave|contributed?).*?(?:for|in|at)\s+(?:my\s+)?(.+?)(?:\?|$)/,
    );
    if (personEventEn) {
      return {
        type: 'person_event_contribution',
        personName: this.cleanName(personEventEn[1]),
        eventName: this.cleanName(personEventEn[2]),
      };
    }

    const personEventTa = text.match(
      /(.+?)\s+(?:என்|எனது|நம்)\s+(.+?)(?:க்கு|க்குள்|ல)?\s+(?:எவ்வளவு|எத்தனை)?\s*(?:கொடுத்தார்|கொடுத்தது|கொடுத்தாங்க)/,
    );
    if (personEventTa) {
      return {
        type: 'person_event_contribution',
        personName: this.cleanName(personEventTa[1]),
        eventName: this.cleanName(personEventTa[2]),
      };
    }

    // --- Person balance ---
    // English: "How much I have to give to [person]?" / "How much [person] gave me?"
    // Tamil: "[person] எவ்வளவு கொடுக்க வேண்டும்?" / "[person]க்கு எவ்வளவு?"
    const personBalanceEn1 = lower.match(
      /(?:how much).*?(?:i\s+(?:have\s+to|need\s+to|should))?\s*(?:give|pay)\s+(?:to\s+)?(.+?)(?:\?|$)/,
    );
    if (personBalanceEn1) {
      return { type: 'person_balance', personName: this.cleanName(personBalanceEn1[1]) };
    }

    const personBalanceEn2 = lower.match(
      /(?:how much|what(?:'s| is)).*?(?:balance|account|status).*?(?:with|of|for)\s+(.+?)(?:\?|$)/,
    );
    if (personBalanceEn2) {
      return { type: 'person_balance', personName: this.cleanName(personBalanceEn2[1]) };
    }

    const personBalanceEn3 = lower.match(
      /(?:how much).*?(.+?)\s+(?:gave|given|give|owes?|has given)(?:\s+(?:me|to me))?(?:\?|$)/,
    );
    if (personBalanceEn3) {
      return { type: 'person_balance', personName: this.cleanName(personBalanceEn3[1]) };
    }

    // Tamil: "[person]க்கு எவ்வளவு கொடுக்க வேண்டும்?"
    const personBalanceTa1 = text.match(
      /(.+?)(?:க்கு|கிட்ட|விடம்)\s+(?:எவ்வளவு|எத்தனை)\s*(?:கொடுக்க|கொடுக்கணும்|கொடுக்க வேண்டும்)/,
    );
    if (personBalanceTa1) {
      return { type: 'person_balance', personName: this.cleanName(personBalanceTa1[1]) };
    }

    // Tamil: "[person] எவ்வளவு கொடுத்தார்?" / "[person] எனக்கு எவ்வளவு கொடுத்தார்?"
    const personBalanceTa2 = text.match(
      /(.+?)\s+(?:எனக்கு\s+)?(?:எவ்வளவு|எத்தனை)\s*(?:கொடுத்தார்|கொடுத்தது|கொடுத்தாங்க|கொடுத்தாரு)/,
    );
    if (personBalanceTa2) {
      return { type: 'person_balance', personName: this.cleanName(personBalanceTa2[1]) };
    }

    // --- Event total ---
    const eventTotalEn = lower.match(
      /(?:how much|total|what).*?(?:received|collected|got).*?(?:for|in|at|from)\s+(?:my\s+)?(.+?)(?:\?|$)/,
    );
    if (eventTotalEn) {
      return { type: 'event_total', eventName: this.cleanName(eventTotalEn[1]) };
    }

    const eventTotalTa = text.match(
      /(?:என்|எனது|நம்)\s+(.+?)(?:ல|க்கு|யில்)?\s+(?:எவ்வளவு|மொத்தம்)\s*(?:வந்தது|பெற்றது|கிடைத்தது)/,
    );
    if (eventTotalTa) {
      return { type: 'event_total', eventName: this.cleanName(eventTotalTa[1]) };
    }

    return { type: 'unknown' };
  }

  /**
   * Detect an event type keyword from free-form text.
   * Returns a normalized event type label used for expense estimation.
   */
  private detectEventType(lower: string): string {
    const map: Array<[string[], string]> = [
      [['wedding', 'marriage', 'திருமணம்', 'கல்யாணம்'], 'WEDDING'],
      [['birthday', 'பிறந்தநாள்'], 'BIRTHDAY'],
      [['housewarming', 'gruhapravesam', 'புதுமனை'], 'HOUSEWARMING'],
      [['ear piercing', 'காதணி'], 'EAR_PIERCING'],
    ];
    for (const [keywords, type] of map) {
      if (this.matchesAny(lower, keywords)) return type;
    }
    return 'ANY';
  }

  /**
   * Execute parsed intent against the database and return answer.
   */
  private async executeIntent(
    intent: SearchIntent,
    lang: 'en' | 'ta',
  ): Promise<{ answer: string; data?: Record<string, any> }> {
    const db = await getDB();
    const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
    const fmtGold = (n: number) => `${n.toFixed(2)}g`;

    switch (intent.type) {
      case 'total_cash_received': {
        const [res] = await db.executeSql(
          `SELECT COALESCE(SUM(cash_amount), 0) AS total FROM entries WHERE entry_type = 'OWN_EVENT'`,
        );
        const total = Number(res.rows.item(0).total) || 0;
        return {
          answer: lang === 'ta'
            ? `நீங்கள் மொத்தம் ${fmt(total)} பணம் பெற்றுள்ளீர்கள்.`
            : `You have received a total of ${fmt(total)} in cash.`,
          data: { totalCashReceived: total },
        };
      }

      case 'total_cash_given': {
        const [res] = await db.executeSql(
          `SELECT COALESCE(SUM(cash_amount), 0) AS total FROM entries WHERE entry_type = 'OTHER_EVENT'`,
        );
        const total = Number(res.rows.item(0).total) || 0;
        return {
          answer: lang === 'ta'
            ? `நீங்கள் மொத்தம் ${fmt(total)} பணம் கொடுத்துள்ளீர்கள்.`
            : `You have given a total of ${fmt(total)} in cash.`,
          data: { totalCashGiven: total },
        };
      }

      case 'total_cash_to_receive': {
        const [res] = await db.executeSql(`
          SELECT person_name,
            COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out
          FROM entries
          WHERE person_id IS NOT NULL
          GROUP BY person_id
        `);
        let total = 0;
        for (let i = 0; i < res.rows.length; i++) {
          const row = res.rows.item(i);
          const net = Number(row.cash_in) - Number(row.cash_out);
          if (net < 0) total += Math.abs(net);
        }
        return {
          answer: lang === 'ta'
            ? `நீங்கள் மொத்தம் ${fmt(total)} பணம் பெற வேண்டியுள்ளது.`
            : `You have a total of ${fmt(total)} cash to receive.`,
          data: { totalCashToReceive: total },
        };
      }

      case 'total_cash_to_give': {
        const [res] = await db.executeSql(`
          SELECT person_name,
            COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out
          FROM entries
          WHERE person_id IS NOT NULL
          GROUP BY person_id
        `);
        let total = 0;
        for (let i = 0; i < res.rows.length; i++) {
          const row = res.rows.item(i);
          const net = Number(row.cash_in) - Number(row.cash_out);
          if (net > 0) total += net;
        }
        return {
          answer: lang === 'ta'
            ? `நீங்கள் மொத்தம் ${fmt(total)} பணம் கொடுக்க வேண்டியுள்ளது.`
            : `You have a total of ${fmt(total)} cash to give.`,
          data: { totalCashToGive: total },
        };
      }

      case 'total_gold_received': {
        const [res] = await db.executeSql(
          `SELECT COALESCE(SUM(gold_weight), 0) AS total FROM entries WHERE entry_type = 'OWN_EVENT'`,
        );
        const total = Number(res.rows.item(0).total) || 0;
        return {
          answer: lang === 'ta'
            ? `நீங்கள் மொத்தம் ${fmtGold(total)} தங்கம் பெற்றுள்ளீர்கள்.`
            : `You have received a total of ${fmtGold(total)} gold.`,
          data: { totalGoldReceived: total },
        };
      }

      case 'total_gold_given': {
        const [res] = await db.executeSql(
          `SELECT COALESCE(SUM(gold_weight), 0) AS total FROM entries WHERE entry_type = 'OTHER_EVENT'`,
        );
        const total = Number(res.rows.item(0).total) || 0;
        return {
          answer: lang === 'ta'
            ? `நீங்கள் மொத்தம் ${fmtGold(total)} தங்கம் கொடுத்துள்ளீர்கள்.`
            : `You have given a total of ${fmtGold(total)} gold.`,
          data: { totalGoldGiven: total },
        };
      }

      case 'person_balance': {
        const name = intent.personName;
        const [res] = await db.executeSql(
          `SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
            COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_in,
            COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out
          FROM entries
          WHERE LOWER(person_name) LIKE ?`,
          [`%${name.toLowerCase()}%`],
        );

        if (res.rows.length === 0) {
          return {
            answer: lang === 'ta'
              ? `"${name}" என்ற நபருக்கான பதிவுகள் எதுவும் கிடைக்கவில்லை.`
              : `No entries found for "${name}".`,
          };
        }

        const row = res.rows.item(0);
        const cashIn = Number(row.cash_in) || 0;
        const cashOut = Number(row.cash_out) || 0;
        const goldIn = Number(row.gold_in) || 0;
        const goldOut = Number(row.gold_out) || 0;
        const netCash = cashIn - cashOut;
        const netGold = goldIn - goldOut;

        let answer: string;
        if (lang === 'ta') {
          answer = `${name} - கணக்கு:\n`;
          answer += `• பெற்ற பணம்: ${fmt(cashIn)}\n`;
          answer += `• கொடுத்த பணம்: ${fmt(cashOut)}\n`;
          if (goldIn > 0 || goldOut > 0) {
            answer += `• பெற்ற தங்கம்: ${fmtGold(goldIn)}\n`;
            answer += `• கொடுத்த தங்கம்: ${fmtGold(goldOut)}\n`;
          }
          if (netCash < 0) {
            answer += `\n→ ${name} இடமிருந்து ${fmt(Math.abs(netCash))} பெற வேண்டியுள்ளது.`;
          } else if (netCash > 0) {
            answer += `\n→ ${name} க்கு ${fmt(netCash)} கொடுக்க வேண்டியுள்ளது.`;
          } else {
            answer += `\n→ கணக்கு சமமாக உள்ளது.`;
          }
        } else {
          answer = `Account with ${name}:\n`;
          answer += `• Cash received: ${fmt(cashIn)}\n`;
          answer += `• Cash given: ${fmt(cashOut)}\n`;
          if (goldIn > 0 || goldOut > 0) {
            answer += `• Gold received: ${fmtGold(goldIn)}\n`;
            answer += `• Gold given: ${fmtGold(goldOut)}\n`;
          }
          if (netCash < 0) {
            answer += `\n→ You need to receive ${fmt(Math.abs(netCash))} from ${name}.`;
          } else if (netCash > 0) {
            answer += `\n→ You need to give ${fmt(netCash)} to ${name}.`;
          } else {
            answer += `\n→ Account is settled.`;
          }
        }

        return { answer, data: { cashIn, cashOut, goldIn, goldOut, netCash, netGold } };
      }

      case 'person_event_contribution': {
        const { personName, eventName } = intent;
        const [res] = await db.executeSql(
          `SELECT
            COALESCE(SUM(cash_amount), 0) AS cash,
            COALESCE(SUM(gold_weight), 0) AS gold
          FROM entries
          WHERE entry_type = 'OWN_EVENT'
            AND LOWER(person_name) LIKE ?
            AND LOWER(event_name) LIKE ?`,
          [`%${personName.toLowerCase()}%`, `%${eventName.toLowerCase()}%`],
        );

        const row = res.rows.item(0);
        const cash = Number(row.cash) || 0;
        const gold = Number(row.gold) || 0;

        if (cash === 0 && gold === 0) {
          return {
            answer: lang === 'ta'
              ? `"${personName}" உங்கள் "${eventName}" நிகழ்வுக்கு எந்த பங்களிப்பும் செய்யவில்லை அல்லது பதிவு கிடைக்கவில்லை.`
              : `No contribution found from "${personName}" for your "${eventName}" event.`,
          };
        }

        let answer: string;
        if (lang === 'ta') {
          answer = `${personName} உங்கள் ${eventName} நிகழ்வுக்கு:\n`;
          if (cash > 0) answer += `• பணம்: ${fmt(cash)}\n`;
          if (gold > 0) answer += `• தங்கம்: ${fmtGold(gold)}\n`;
          answer += `கொடுத்துள்ளார்.`;
        } else {
          answer = `${personName} gave for your ${eventName}:\n`;
          if (cash > 0) answer += `• Cash: ${fmt(cash)}\n`;
          if (gold > 0) answer += `• Gold: ${fmtGold(gold)}`;
        }

        return { answer, data: { cash, gold } };
      }

      case 'event_total': {
        const { eventName } = intent;
        const [res] = await db.executeSql(
          `SELECT
            COUNT(*) AS entries,
            COALESCE(SUM(cash_amount), 0) AS cash,
            COALESCE(SUM(gold_weight), 0) AS gold
          FROM entries
          WHERE entry_type = 'OWN_EVENT'
            AND LOWER(event_name) LIKE ?`,
          [`%${eventName.toLowerCase()}%`],
        );

        const row = res.rows.item(0);
        const entries = Number(row.entries) || 0;
        const cash = Number(row.cash) || 0;
        const gold = Number(row.gold) || 0;

        if (entries === 0) {
          return {
            answer: lang === 'ta'
              ? `"${eventName}" நிகழ்வுக்கான பதிவுகள் கிடைக்கவில்லை.`
              : `No entries found for "${eventName}" event.`,
          };
        }

        let answer: string;
        if (lang === 'ta') {
          answer = `உங்கள் ${eventName} நிகழ்வு சுருக்கம்:\n`;
          answer += `• மொத்த பதிவுகள்: ${entries}\n`;
          answer += `• மொத்த பணம்: ${fmt(cash)}\n`;
          if (gold > 0) answer += `• மொத்த தங்கம்: ${fmtGold(gold)}`;
        } else {
          answer = `Your ${eventName} event summary:\n`;
          answer += `• Total entries: ${entries}\n`;
          answer += `• Total cash: ${fmt(cash)}\n`;
          if (gold > 0) answer += `• Total gold: ${fmtGold(gold)}`;
        }

        return { answer, data: { entries, cash, gold } };
      }

      case 'event_expense_estimate': {
        // Estimate expected expenses for an event type based on historical data.
        // Uses the user's OWN events (estimated_cost / actual_expenses) and, when
        // absent, derives an estimate from average received contributions.
        const eventType = intent.eventType;
        const typeClause = eventType !== 'ANY' ? `AND UPPER(type) = ?` : '';
        const typeParams = eventType !== 'ANY' ? [eventType] : [];

        // Historical own-event expenses of this type
        const [expRes] = await db.executeSql(
          `SELECT
             COUNT(*) AS event_count,
             COALESCE(AVG(NULLIF(estimated_cost, 0)), 0) AS avg_estimated,
             COALESCE(AVG(NULLIF(actual_expenses, 0)), 0) AS avg_actual,
             COALESCE(MAX(actual_expenses), 0) AS max_actual
           FROM events
           WHERE owner_type = 'MY_EVENT' ${typeClause}`,
          typeParams,
        );
        const expRow = expRes.rows.item(0);
        const eventCount = Number(expRow.event_count) || 0;
        const avgEstimated = Number(expRow.avg_estimated) || 0;
        const avgActual = Number(expRow.avg_actual) || 0;

        // Average contribution received per person (helps estimate recoverable amount)
        const [contribRes] = await db.executeSql(
          `SELECT COALESCE(AVG(cash_amount), 0) AS avg_cash, COUNT(*) AS cnt
           FROM entries WHERE entry_type = 'OWN_EVENT' AND cash_amount > 0`,
        );
        const avgContribution = Number(contribRes.rows.item(0).avg_cash) || 0;
        const contributionCount = Number(contribRes.rows.item(0).cnt) || 0;

        // Choose the best available estimate
        const estimate = avgActual > 0 ? avgActual : avgEstimated;

        const typeLabelEn: Record<string, string> = {
          WEDDING: 'wedding', BIRTHDAY: 'birthday', HOUSEWARMING: 'housewarming',
          EAR_PIERCING: 'ear piercing', ANY: 'event',
        };
        const typeLabelTa: Record<string, string> = {
          WEDDING: 'திருமணம்', BIRTHDAY: 'பிறந்தநாள்', HOUSEWARMING: 'புதுமனை',
          EAR_PIERCING: 'காதணி', ANY: 'நிகழ்வு',
        };
        const label = lang === 'ta' ? (typeLabelTa[eventType] ?? 'நிகழ்வு') : (typeLabelEn[eventType] ?? 'event');

        let answer: string;
        if (lang === 'ta') {
          if (estimate > 0) {
            answer = `உங்கள் ${label} நிகழ்வுக்கான எதிர்பார்க்கப்படும் செலவு சுமார் ${fmt(estimate)}.\n`;
            answer += `(${eventCount} முந்தைய நிகழ்வுகளின் அடிப்படையில்)\n\n`;
          } else {
            answer = `${label} நிகழ்வுக்கான போதுமான வரலாற்றுத் தரவு இல்லை.\n\n`;
          }
          answer += `செலவைக் குறைக்க ஆலோசனைகள்:\n`;
          answer += `• முன்பதிவுகளை (மண்டபம், சமையல்) முன்கூட்டியே செய்து தள்ளுபடி பெறுங்கள்.\n`;
          answer += `• அழைப்பாளர் பட்டியலை உங்கள் Moi வரலாற்றின் அடிப்படையில் மேம்படுத்துங்கள்.\n`;
          if (avgContribution > 0) {
            answer += `• சராசரி பங்களிப்பு ${fmt(avgContribution)} — வரவேற்கத்தக்க பங்களிப்பு மூலம் நிகர செலவைக் குறைக்கலாம்.\n`;
          }
          answer += `• தேவையற்ற செலவுகளைத் தவிர்த்து அத்தியாவசியங்களில் கவனம் செலுத்துங்கள்.`;
        } else {
          if (estimate > 0) {
            answer = `The expected expense for your ${label} is around ${fmt(estimate)}.\n`;
            answer += `(Based on ${eventCount} past event(s))\n\n`;
          } else {
            answer = `Not enough history to estimate a ${label} budget yet.\n\n`;
          }
          answer += `Suggestions to reduce expenses:\n`;
          answer += `• Book venue and catering early to lock in lower rates.\n`;
          answer += `• Trim the invite list using your Moi history to focus on close contacts.\n`;
          if (avgContribution > 0) {
            answer += `• Average contribution is ${fmt(avgContribution)} — expected contributions can offset a large part of the cost.\n`;
          }
          answer += `• Prioritise essentials and avoid last-minute add-ons.`;
        }

        return {
          answer,
          data: { eventType, eventCount, avgEstimated, avgActual, estimate, avgContribution, contributionCount },
        };
      }

      case 'overall_summary': {
        const [res] = await db.executeSql(
          `SELECT
             COUNT(*) AS entries,
             COUNT(DISTINCT COALESCE(person_id, person_name)) AS persons,
             COUNT(DISTINCT CASE WHEN village_name IS NOT NULL AND village_name != '' THEN village_name END) AS villages,
             COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
             COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
             COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_in,
             COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out
           FROM entries`,
        );
        const row = res.rows.item(0);
        const entries = Number(row.entries) || 0;
        const persons = Number(row.persons) || 0;
        const villages = Number(row.villages) || 0;
        const cashIn = Number(row.cash_in) || 0;
        const cashOut = Number(row.cash_out) || 0;
        const goldIn = Number(row.gold_in) || 0;
        const goldOut = Number(row.gold_out) || 0;

        if (entries === 0) {
          return {
            answer: lang === 'ta'
              ? 'இதுவரை பதிவுகள் எதுவும் இல்லை. முதல் பதிவைச் சேர்க்கவும்.'
              : 'No entries recorded yet. Add your first entry to get started.',
          };
        }

        let answer: string;
        if (lang === 'ta') {
          answer = `உங்கள் Moi கணக்கு சுருக்கம்:\n`;
          answer += `• மொத்த பதிவுகள்: ${entries}\n`;
          answer += `• நபர்கள்: ${persons} · கிராமங்கள்: ${villages}\n`;
          answer += `• பெற்ற பணம்: ${fmt(cashIn)} · கொடுத்த பணம்: ${fmt(cashOut)}\n`;
          if (goldIn > 0 || goldOut > 0) {
            answer += `• பெற்ற தங்கம்: ${fmtGold(goldIn)} · கொடுத்த தங்கம்: ${fmtGold(goldOut)}\n`;
          }
        } else {
          answer = `Your Moi account summary:\n`;
          answer += `• Total entries: ${entries}\n`;
          answer += `• People: ${persons} · Villages: ${villages}\n`;
          answer += `• Cash received: ${fmt(cashIn)} · Cash given: ${fmt(cashOut)}\n`;
          if (goldIn > 0 || goldOut > 0) {
            answer += `• Gold received: ${fmtGold(goldIn)} · Gold given: ${fmtGold(goldOut)}\n`;
          }
        }
        return { answer, data: { entries, persons, villages, cashIn, cashOut, goldIn, goldOut } };
      }

      case 'today_summary': {
        const today = new Date().toISOString().split('T')[0];
        const [res] = await db.executeSql(
          `SELECT
            COUNT(*) AS entries,
            COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
            COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_in,
            COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out
          FROM entries
          WHERE DATE(created_at) = ?`,
          [today],
        );

        const row = res.rows.item(0);
        const entries = Number(row.entries) || 0;
        const cashIn = Number(row.cash_in) || 0;
        const cashOut = Number(row.cash_out) || 0;
        const goldIn = Number(row.gold_in) || 0;
        const goldOut = Number(row.gold_out) || 0;

        if (entries === 0) {
          return {
            answer: lang === 'ta'
              ? 'இன்று பதிவுகள் எதுவும் இல்லை.'
              : 'No entries recorded today.',
          };
        }

        let answer: string;
        if (lang === 'ta') {
          answer = `இன்றைய சுருக்கம்:\n`;
          answer += `• மொத்த பதிவுகள்: ${entries}\n`;
          answer += `• பெற்ற பணம்: ${fmt(cashIn)}\n`;
          answer += `• கொடுத்த பணம்: ${fmt(cashOut)}\n`;
          if (goldIn > 0) answer += `• பெற்ற தங்கம்: ${fmtGold(goldIn)}\n`;
          if (goldOut > 0) answer += `• கொடுத்த தங்கம்: ${fmtGold(goldOut)}`;
        } else {
          answer = `Today's summary:\n`;
          answer += `• Total entries: ${entries}\n`;
          answer += `• Cash received: ${fmt(cashIn)}\n`;
          answer += `• Cash given: ${fmt(cashOut)}\n`;
          if (goldIn > 0) answer += `• Gold received: ${fmtGold(goldIn)}\n`;
          if (goldOut > 0) answer += `• Gold given: ${fmtGold(goldOut)}`;
        }

        return { answer, data: { entries, cashIn, cashOut, goldIn, goldOut } };
      }

      case 'unknown':
      default: {
        // Instead of a dead-end error, give a helpful overall summary so any
        // spoken query still returns something useful.
        const summary = await this.executeIntent({ type: 'overall_summary' }, lang);
        const preamble = lang === 'ta'
          ? 'உங்கள் கேள்வியைத் துல்லியமாகப் புரிந்து கொள்ள முடியவில்லை — இதோ ஒரு பொதுவான சுருக்கம்:\n\n'
          : "I couldn't match that exactly — here's a general summary:\n\n";
        return {
          answer: preamble + summary.answer,
          data: summary.data,
        };
      }
    }
  }

  private matchesAny(text: string, patterns: string[]): boolean {
    return patterns.some((p) => text.includes(p));
  }

  private cleanName(raw: string): string {
    return raw
      .replace(/[?.,!'"]/g, '')
      .replace(/\b(the|a|an|mr|mrs|ms|sir)\b/gi, '')
      .trim();
  }

  destroy(): void {
    this._recognizer?.destroy();
    this._recognizer = null;
  }
}

import { TamilSpeechRecognizer } from './TamilSpeechRecognizer';
import { getDB } from '../database/db';

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
  | { type: 'today_summary' }
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
    this.recognizer.onResult((text) => {
      console.log('[VoiceSearchService] recognised:', text);
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
      default:
        return {
          answer: lang === 'ta'
            ? 'மன்னிக்கவும், உங்கள் கேள்வியைப் புரிந்து கொள்ள முடியவில்லை. வேறு விதமாக கேட்டு பாருங்கள்.\n\nஎடுத்துக்காட்டுகள்:\n• "மொத்தம் பெற வேண்டிய பணம் எவ்வளவு?"\n• "கண்ணன் எவ்வளவு கொடுத்தார்?"\n• "இன்றைய சுருக்கம்"'
            : 'Sorry, I couldn\'t understand your question. Try asking differently.\n\nExamples:\n• "What\'s the total cash to be received?"\n• "How much did Kannan give?"\n• "Today\'s summary"',
        };
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

/**
 * Property Test: Translation Key Completeness
 *
 * **Validates: Requirements 6.2, 12.1**
 *
 * Property 2: For all keys in en.ts, a corresponding non-empty key exists in ta.ts,
 * and vice versa — ensuring no translation gaps between languages.
 */
import en from '../../src/common/i18n/en';
import ta from '../../src/common/i18n/ta';

/**
 * Recursively extracts all leaf keys from a nested object as dot-notation paths.
 * Only includes keys whose values are non-object primitives (strings, numbers, etc).
 */
function getLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...getLeafKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * Gets the value at a dot-notation path in a nested object.
 */
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

describe('Property 2: Translation Key Completeness', () => {
  const enKeys = getLeafKeys(en as unknown as Record<string, unknown>);
  const taKeys = getLeafKeys(ta as unknown as Record<string, unknown>);

  it('should have at least one translation key in each language', () => {
    expect(enKeys.length).toBeGreaterThan(0);
    expect(taKeys.length).toBeGreaterThan(0);
  });

  it('should have the same set of keys in both en and ta', () => {
    const enSet = new Set(enKeys);
    const taSet = new Set(taKeys);

    const missingInTa = enKeys.filter(key => !taSet.has(key));
    const missingInEn = taKeys.filter(key => !enSet.has(key));

    if (missingInTa.length > 0) {
      fail(
        `Keys present in en.ts but missing in ta.ts:\n${missingInTa.map(k => `  - ${k}`).join('\n')}`,
      );
    }

    if (missingInEn.length > 0) {
      fail(
        `Keys present in ta.ts but missing in en.ts:\n${missingInEn.map(k => `  - ${k}`).join('\n')}`,
      );
    }

    expect(enKeys.length).toBe(taKeys.length);
  });

  describe('All English leaf values are non-empty strings', () => {
    it.each(enKeys)('en.%s should be a non-empty string', (key) => {
      const value = getValueAtPath(en as unknown as Record<string, unknown>, key);
      expect(typeof value).toBe('string');
      expect((value as string).trim().length).toBeGreaterThan(0);
    });
  });

  describe('All Tamil leaf values are non-empty strings', () => {
    it.each(taKeys)('ta.%s should be a non-empty string', (key) => {
      const value = getValueAtPath(ta as unknown as Record<string, unknown>, key);
      expect(typeof value).toBe('string');
      expect((value as string).trim().length).toBeGreaterThan(0);
    });
  });

  it('every en key has a corresponding non-empty ta value', () => {
    for (const key of enKeys) {
      const taValue = getValueAtPath(ta as unknown as Record<string, unknown>, key);
      expect(taValue).toBeDefined();
      expect(typeof taValue).toBe('string');
      expect((taValue as string).trim().length).toBeGreaterThan(0);
    }
  });

  it('every ta key has a corresponding non-empty en value', () => {
    for (const key of taKeys) {
      const enValue = getValueAtPath(en as unknown as Record<string, unknown>, key);
      expect(enValue).toBeDefined();
      expect(typeof enValue).toBe('string');
      expect((enValue as string).trim().length).toBeGreaterThan(0);
    }
  });
});

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ta from './ta';
import en from './en';

export const defaultLanguage = 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ta: { translation: ta },
      en: { translation: en },
    },
    lng: defaultLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

export default i18n;

export type TranslationKey = keyof typeof ta;

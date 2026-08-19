import { useTranslation } from 'react-i18next';

type TFunction = (key: string, options?: Record<string, unknown>) => string;

export const useAppTranslation = () => {
  const { t, i18n } = useTranslation();
  return {
    t: t as unknown as TFunction,
    i18n,
    isTamil: i18n.language === 'ta',
  };
};

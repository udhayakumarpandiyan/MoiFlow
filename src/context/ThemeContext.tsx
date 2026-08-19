import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
} from 'react';
import { useColorScheme, ColorSchemeName } from 'react-native';
import { settingsService, Theme } from '../services/SettingsService';

// ---------------------------------------------------------------------------
// ThemeColors — mirrors all keys in src/theme/colors.ts
// ---------------------------------------------------------------------------

export interface ThemeColors {
  // Primary
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryBg: string;

  // Semantic
  inColor: string;
  inBg: string;
  outColor: string;
  outBg: string;
  pendingColor: string;
  pendingBg: string;

  // Gold
  gold: string;
  goldLight: string;
  goldBg: string;

  // Neutral
  background: string;
  surface: string;
  border: string;
  borderLight: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  textInverse: string;

  // Status
  success: string;
  error: string;
  warning: string;
  info: string;

  // Misc
  shadow: string;
  overlay: string;
  transparent: string;
}

// ---------------------------------------------------------------------------
// Theme Palettes
// ---------------------------------------------------------------------------

const lightPalette: ThemeColors = {
  // Primary
  primary: '#0052CC',
  primaryLight: '#3D8BFF',
  primaryDark: '#003A8C',
  primaryBg: '#E8F0FE',

  // Semantic
  inColor: '#15803D',
  inBg: '#DCFCE7',
  outColor: '#DC2626',
  outBg: '#FEE2E2',
  pendingColor: '#D97706',
  pendingBg: '#FEF3C7',

  // Gold
  gold: '#B7791F',
  goldLight: '#D4A017',
  goldBg: '#FEF9EE',

  // Neutral
  background: '#F5F7FA',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  borderLight: '#F0F0F0',

  // Text
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textDisabled: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Status
  success: '#15803D',
  error: '#DC2626',
  warning: '#D97706',
  info: '#0052CC',

  // Misc
  shadow: 'rgba(0,0,0,0.08)',
  overlay: 'rgba(0,0,0,0.45)',
  transparent: 'transparent',
};

const darkPalette: ThemeColors = {
  // Primary
  primary: '#5B9BFF',
  primaryLight: '#82B4FF',
  primaryDark: '#3D8BFF',
  primaryBg: '#1A2744',

  // Semantic
  inColor: '#4ADE80',
  inBg: '#14332A',
  outColor: '#F87171',
  outBg: '#3B1A1A',
  pendingColor: '#FBBF24',
  pendingBg: '#332B14',

  // Gold
  gold: '#F59E0B',
  goldLight: '#FBBF24',
  goldBg: '#2D2510',

  // Neutral
  background: '#0F172A',
  surface: '#1E293B',
  border: '#334155',
  borderLight: '#1E293B',

  // Text
  textPrimary: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textDisabled: '#475569',
  textInverse: '#0F172A',

  // Status
  success: '#4ADE80',
  error: '#F87171',
  warning: '#FBBF24',
  info: '#5B9BFF',

  // Misc
  shadow: 'rgba(0,0,0,0.3)',
  overlay: 'rgba(0,0,0,0.6)',
  transparent: 'transparent',
};

const oceanPalette: ThemeColors = {
  // Primary
  primary: '#0077B6',
  primaryLight: '#00B4D8',
  primaryDark: '#023E8A',
  primaryBg: '#E0F7FA',

  // Semantic
  inColor: '#15803D',
  inBg: '#DCFCE7',
  outColor: '#DC2626',
  outBg: '#FEE2E2',
  pendingColor: '#D97706',
  pendingBg: '#FEF3C7',

  // Gold
  gold: '#B7791F',
  goldLight: '#D4A017',
  goldBg: '#FEF9EE',

  // Neutral
  background: '#F0F9FF',
  surface: '#FFFFFF',
  border: '#BAE6FD',
  borderLight: '#E0F2FE',

  // Text
  textPrimary: '#0C1B33',
  textSecondary: '#1E3A5F',
  textMuted: '#5E7D99',
  textDisabled: '#9CB8CC',
  textInverse: '#FFFFFF',

  // Status
  success: '#15803D',
  error: '#DC2626',
  warning: '#D97706',
  info: '#0077B6',

  // Misc
  shadow: 'rgba(0,119,182,0.08)',
  overlay: 'rgba(0,0,0,0.45)',
  transparent: 'transparent',
};

const forestPalette: ThemeColors = {
  // Primary
  primary: '#2D6A4F',
  primaryLight: '#40916C',
  primaryDark: '#1B4332',
  primaryBg: '#D8F3DC',

  // Semantic
  inColor: '#2D6A4F',
  inBg: '#D8F3DC',
  outColor: '#DC2626',
  outBg: '#FEE2E2',
  pendingColor: '#D97706',
  pendingBg: '#FEF3C7',

  // Gold
  gold: '#B7791F',
  goldLight: '#D4A017',
  goldBg: '#FEF9EE',

  // Neutral
  background: '#F1F8F4',
  surface: '#FFFFFF',
  border: '#B7E4C7',
  borderLight: '#D8F3DC',

  // Text
  textPrimary: '#1B2A21',
  textSecondary: '#2D4A3E',
  textMuted: '#5E7D6E',
  textDisabled: '#9CB8A8',
  textInverse: '#FFFFFF',

  // Status
  success: '#2D6A4F',
  error: '#DC2626',
  warning: '#D97706',
  info: '#2D6A4F',

  // Misc
  shadow: 'rgba(45,106,79,0.08)',
  overlay: 'rgba(0,0,0,0.45)',
  transparent: 'transparent',
};

const sunsetPalette: ThemeColors = {
  // Primary
  primary: '#E85D04',
  primaryLight: '#F48C06',
  primaryDark: '#DC2F02',
  primaryBg: '#FFF3E0',

  // Semantic
  inColor: '#15803D',
  inBg: '#DCFCE7',
  outColor: '#DC2626',
  outBg: '#FEE2E2',
  pendingColor: '#D97706',
  pendingBg: '#FEF3C7',

  // Gold
  gold: '#B7791F',
  goldLight: '#D4A017',
  goldBg: '#FEF9EE',

  // Neutral
  background: '#FFFAF5',
  surface: '#FFFFFF',
  border: '#FFD7B5',
  borderLight: '#FFE8D6',

  // Text
  textPrimary: '#1A0F0A',
  textSecondary: '#3D2E1F',
  textMuted: '#7D6B5D',
  textDisabled: '#B8A99C',
  textInverse: '#FFFFFF',

  // Status
  success: '#15803D',
  error: '#DC2626',
  warning: '#D97706',
  info: '#E85D04',

  // Misc
  shadow: 'rgba(232,93,4,0.08)',
  overlay: 'rgba(0,0,0,0.45)',
  transparent: 'transparent',
};

// ---------------------------------------------------------------------------
// Brand palettes — used by "default" theme, based on MoiFlow app icon/logo colors
// Navy blue primary, teal/cyan accent, green for growth/success
// ---------------------------------------------------------------------------

const brandLightPalette: ThemeColors = {
  // Primary — vibrant green from MoiFlow brand
  primary: '#09a564',
  primaryLight: '#3DC98A',
  primaryDark: '#077A4A',
  primaryBg: '#E5F7EF',

  // Semantic — green for income, red for expense
  inColor: '#15803D',
  inBg: '#DCFCE7',
  outColor: '#DC2626',
  outBg: '#FEE2E2',
  pendingColor: '#D97706',
  pendingBg: '#FEF3C7',

  // Gold
  gold: '#B7791F',
  goldLight: '#D4A017',
  goldBg: '#FEF9EE',

  // Neutral
  background: '#F7FAFA',
  surface: '#FFFFFF',
  border: '#E0EDEA',
  borderLight: '#F0F7F5',

  // Text
  textPrimary: '#1A2E2A',
  textSecondary: '#3D5C55',
  textMuted: '#6B8F86',
  textDisabled: '#A3C4BC',
  textInverse: '#FFFFFF',

  // Status
  success: '#15803D',
  error: '#DC2626',
  warning: '#D97706',
  info: '#0E7490',

  // Misc
  shadow: 'rgba(27,179,143,0.08)',
  overlay: 'rgba(0,0,0,0.45)',
  transparent: 'transparent',
};

const brandDarkPalette: ThemeColors = {
  // Primary — lighter green for dark mode visibility
  primary: '#3DC98A',
  primaryLight: '#6DDBA8',
  primaryDark: '#09a564',
  primaryBg: '#0D2918',

  // Semantic
  inColor: '#4ADE80',
  inBg: '#14332A',
  outColor: '#F87171',
  outBg: '#3B1A1A',
  pendingColor: '#FBBF24',
  pendingBg: '#332B14',

  // Gold
  gold: '#F59E0B',
  goldLight: '#FBBF24',
  goldBg: '#2D2510',

  // Neutral — dark teal-tinted backgrounds
  background: '#0B1F1B',
  surface: '#132E28',
  border: '#1F4A40',
  borderLight: '#183D35',

  // Text
  textPrimary: '#F1F9F7',
  textSecondary: '#C5E0DA',
  textMuted: '#8BB5AA',
  textDisabled: '#4A7068',
  textInverse: '#0B1F1B',

  // Status
  success: '#4ADE80',
  error: '#F87171',
  warning: '#FBBF24',
  info: '#67E8F9',

  // Misc
  shadow: 'rgba(0,0,0,0.3)',
  overlay: 'rgba(0,0,0,0.6)',
  transparent: 'transparent',
};

// ---------------------------------------------------------------------------
// Palette lookup
// ---------------------------------------------------------------------------

const palettes: Record<string, ThemeColors> = {
  light: lightPalette,
  dark: darkPalette,
  ocean: oceanPalette,
  forest: forestPalette,
  sunset: sunsetPalette,
};

// ---------------------------------------------------------------------------
// Resolve theme
// ---------------------------------------------------------------------------

interface ResolvedTheme {
  colors: ThemeColors;
  isDark: boolean;
}

function resolveTheme(
  themeName: Theme,
  systemScheme: ColorSchemeName,
): ResolvedTheme {
  // 'default' follows the device color scheme but uses brand-aligned colors
  if (themeName === 'default') {
    const isDark = systemScheme === 'dark';
    return {
      colors: isDark ? brandDarkPalette : brandLightPalette,
      isDark,
    };
  }

  return {
    colors: palettes[themeName] ?? lightPalette,
    isDark: themeName === 'dark',
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ThemeContextValue {
  colors: ThemeColors;
  themeName: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemScheme = useColorScheme();
  const [themeName, setThemeName] = useState<Theme>('default');

  useEffect(() => {
    settingsService.getTheme().then(setThemeName);
  }, []);

  const setTheme = async (theme: Theme): Promise<void> => {
    await settingsService.setTheme(theme);
    setThemeName(theme);
  };

  const value = useMemo<ThemeContextValue>(() => {
    const resolved = resolveTheme(themeName, systemScheme);
    return {
      colors: resolved.colors,
      themeName,
      setTheme,
      isDark: resolved.isDark,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeName, systemScheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};

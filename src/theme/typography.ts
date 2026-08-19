import { StyleSheet, TextStyle } from 'react-native';
import { Colors } from './colors';

export const Typography = StyleSheet.create({
  h1: { fontSize: 23, fontWeight: '800', color: Colors.textPrimary, lineHeight: 34 },
  h2: { fontSize: 19, fontWeight: '700', color: Colors.textPrimary, lineHeight: 28 },
  h3: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, lineHeight: 24 },
  h4: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, lineHeight: 22 },
  h5: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, lineHeight: 20 },

  body1: { fontSize: 13, fontWeight: '400', color: Colors.textPrimary, lineHeight: 20 },
  body2: { fontSize: 12, fontWeight: '400', color: Colors.textSecondary, lineHeight: 18 },

  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  caption: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5 },
  small: { fontSize: 11, fontWeight: '400', color: Colors.textMuted },

  amount: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  amountIn: { fontSize: 14, fontWeight: '700', color: Colors.inColor },
  amountOut: { fontSize: 14, fontWeight: '700', color: Colors.outColor },
  amountGold: { fontSize: 14, fontWeight: '700', color: Colors.gold },
} as Record<string, TextStyle>);

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radii = {
  sm: 6,
  md: 10,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 999,
} as const;

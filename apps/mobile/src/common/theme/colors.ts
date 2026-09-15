export const Colors = {
  // Primary — MoiFlow brand green
  primary:       '#09a564',
  primaryLight:  '#3DC98A',
  primaryDark:   '#077A4A',
  primaryBg:     '#E5F7EF',

  // Semantic
  inColor:       '#15803D',   // IN / received
  inBg:          '#DCFCE7',
  outColor:      '#DC2626',   // OUT / given
  outBg:         '#FEE2E2',
  pendingColor:  '#D97706',   // pending / payable
  pendingBg:     '#FEF3C7',

  // Gold
  gold:          '#B7791F',
  goldLight:     '#D4A017',
  goldBg:        '#FEF9EE',

  // Neutral
  background:    '#F7FAFA',
  surface:       '#FFFFFF',
  border:        '#E0EDEA',
  borderLight:   '#F0F7F5',

  // Text
  textPrimary:   '#1A2E2A',
  textSecondary: '#3D5C55',
  textMuted:     '#6B8F86',
  textDisabled:  '#A3C4BC',
  textInverse:   '#FFFFFF',

  // Status
  success:       '#15803D',
  error:         '#DC2626',
  warning:       '#D97706',
  info:          '#0E7490',

  // Misc
  shadow:        'rgba(27,179,143,0.08)',
  overlay:       'rgba(0,0,0,0.45)',
  transparent:   'transparent',
} as const;

export type ColorKey = keyof typeof Colors;

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@common/context/ThemeContext';

interface BadgeProps {
  label: string;
  type: 'in' | 'out' | 'pending' | 'settled' | 'primary';
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({ label, type, style }) => {
  const { colors } = useTheme();

  const bgColors: Record<string, string> = {
    in: colors.inBg,
    out: colors.outBg,
    pending: colors.pendingBg,
    settled: colors.border,
    primary: colors.primaryBg,
  };

  const fgColors: Record<string, string> = {
    in: colors.inColor,
    out: colors.outColor,
    pending: colors.pendingColor,
    settled: colors.textMuted,
    primary: colors.primary,
  };

  return (
    <View style={[styles.base, { backgroundColor: bgColors[type] ?? colors.primaryBg }, style]}>
      <Text style={[styles.text, { color: fgColors[type] ?? colors.primary }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

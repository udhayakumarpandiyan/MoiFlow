import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Card } from './Card';
import { Colors } from '@common/theme/colors';

interface SummaryCardProps {
  label: string;
  value: string;
  valueColor?: string;
  subValue?: string;
  style?: ViewStyle;
  onPress?: () => void;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  label,
  value,
  valueColor = Colors.textPrimary,
  subValue,
  style,
  onPress,
}) => {
  return (
    <Card style={style} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      {subValue ? <Text style={styles.subValue}>{subValue}</Text> : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 19,
    fontWeight: '700',
    marginTop: 8,
  },
  subValue: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
});

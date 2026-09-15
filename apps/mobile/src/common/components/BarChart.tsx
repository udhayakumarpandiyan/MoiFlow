import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@common/context/ThemeContext';

export interface BarSeries {
  /** Values, one per label. Length should match `labels`. */
  data: number[];
  color: string;
  label: string;
}

interface BarChartProps {
  labels: string[];
  series: BarSeries[];
  /** Chart plotting height in px (bars scale to this). Default 120. */
  height?: number;
}

/**
 * Lightweight, dependency-free bar chart built from plain Views — mirrors the
 * inline chart used on the Moi Reports screen. Supports one or more series
 * (grouped bars) with a colour legend. Renders nothing meaningful when all
 * values are zero (caller should show an empty state instead).
 */
export const BarChart: React.FC<BarChartProps> = ({ labels, series, height = 120 }) => {
  const { colors } = useTheme();

  const max = Math.max(
    1,
    ...series.flatMap(s => s.data.map(v => (Number.isFinite(v) ? v : 0))),
  );

  return (
    <View>
      <View style={[styles.plot, { height }]}>
        {labels.map((label, i) => (
          <View key={`${label}-${i}`} style={styles.column}>
            <View style={[styles.barArea, { height }]}>
              {series.map((s, si) => {
                const value = s.data[i] ?? 0;
                const barHeight = max > 0 ? Math.max(2, (value / max) * (height - 4)) : 2;
                return (
                  <View
                    key={si}
                    style={[styles.bar, { height: barHeight, backgroundColor: s.color }]}
                  />
                );
              })}
            </View>
            <Text style={[styles.axisLabel, { color: colors.textDisabled }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {series.length > 1 || series[0]?.label ? (
        <View style={styles.legend}>
          {series.map((s, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
  },
  column: { flex: 1, alignItems: 'center' },
  barArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  bar: { width: 8, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  axisLabel: { fontSize: 9, marginTop: 4 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, fontWeight: '600' },
});

export default BarChart;

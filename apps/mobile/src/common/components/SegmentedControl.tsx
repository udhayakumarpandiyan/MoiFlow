import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@common/context/ThemeContext';

export interface Segment {
  key: string;
  label: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  selected: string;
  onSelect: (key: string) => void;
  style?: ViewStyle;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  segments,
  selected,
  onSelect,
  style,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }, style]}>
      {segments.map(seg => (
        <TouchableOpacity
          key={seg.key}
          style={[
            styles.segment,
            selected === seg.key && [styles.segmentActive, { backgroundColor: colors.surface }],
          ]}
          onPress={() => onSelect(seg.key)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.text,
              { color: colors.textMuted },
              selected === seg.key && { color: colors.primary, fontWeight: '700' },
            ]}
          >
            {seg.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});

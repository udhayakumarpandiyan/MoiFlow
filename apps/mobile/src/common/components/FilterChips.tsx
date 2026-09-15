import React from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Colors } from '@common/theme/colors';

export interface FilterChip {
  key: string;
  label: string;
}

interface FilterChipsProps {
  chips: FilterChip[];
  selected: string;
  onSelect: (key: string) => void;
  style?: ViewStyle;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  chips,
  selected,
  onSelect,
  style,
}) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.container, style]}
    >
      {chips.map(chip => (
        <TouchableOpacity
          key={chip.key}
          onPress={() => onSelect(chip.key)}
          style={[styles.chip, selected === chip.key && styles.chipActive]}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.chipText,
              selected === chip.key && styles.chipTextActive,
            ]}
          >
            {chip.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 2,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  chipTextActive: {
    color: Colors.textInverse,
  },
});

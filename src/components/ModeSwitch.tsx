import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useAppTranslation } from '../hooks/useAppTranslation';

type AppMode = 'moi' | 'finance';

interface ModeSwitchProps {
  /** Which top-level mode is currently active. */
  current: AppMode;
}

/**
 * A compact Moi | Finance segmented pill for the persistent header. Because the
 * header sits ABOVE the tab navigators, useNavigation() here is the RootStack,
 * so switching modes navigates between the 'MainTab' and 'FinanceTab' root
 * screens. Theme/auth are shared, so no state is lost across the switch.
 */
export const ModeSwitch: React.FC<ModeSwitchProps> = ({ current }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const navigation = useNavigation<any>();

  const go = (mode: AppMode) => {
    if (mode === current) return;
    navigation.navigate(mode === 'moi' ? 'MainTab' : 'FinanceTab');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.primaryBg }]}>
      <Segment
        label={t('mode.moi')}
        active={current === 'moi'}
        onPress={() => go('moi')}
        activeBg={colors.surface}
        activeColor={colors.primary}
        inactiveColor={colors.textMuted}
      />
      <Segment
        label={t('mode.finance')}
        active={current === 'finance'}
        onPress={() => go('finance')}
        activeBg={colors.surface}
        activeColor={colors.primary}
        inactiveColor={colors.textMuted}
      />
    </View>
  );
};

const Segment: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
  activeBg: string;
  activeColor: string;
  inactiveColor: string;
}> = ({ label, active, onPress, activeBg, activeColor, inactiveColor }) => (
  <Pressable
    onPress={onPress}
    style={[styles.segment, active && { backgroundColor: activeBg }]}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
  >
    <Text
      style={[
        styles.label,
        { color: active ? activeColor : inactiveColor, fontWeight: active ? '800' : '600' },
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 17,
  },
  label: {
    fontSize: 12.5,
  },
});

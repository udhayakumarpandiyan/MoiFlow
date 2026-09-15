import React from 'react';
import { View, StyleSheet } from 'react-native';
import Feather from '@react-native-vector-icons/feather';
import { useTheme } from '@common/context/ThemeContext';

interface PremiumLockIconProps {
  /** Diameter of the lock badge. Default 16. */
  size?: number;
}

/**
 * A small "lock" badge, meant to be overlaid on the corner of a Premium-only
 * control (e.g. a voice mic FAB) so Free users can see it is gated before
 * tapping. Position it inside a relatively-positioned parent.
 */
export const PremiumLockIcon: React.FC<PremiumLockIconProps> = ({ size = 16 }) => {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.pendingColor,
          borderColor: colors.surface,
        },
      ]}
    >
      <Feather name="lock" size={size * 0.55} color={colors.textInverse} />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

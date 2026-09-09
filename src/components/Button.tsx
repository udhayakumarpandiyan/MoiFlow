import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Animated,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
}) => {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const pressTo = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 5,
    }).start();

  const variantStyles: Record<ButtonVariant, ViewStyle> = {
    primary:   { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.primaryBg },
    danger:    { backgroundColor: colors.error },
    outline:   { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'transparent' },
    ghost:     { backgroundColor: 'transparent' },
  };

  const variantTextStyles: Record<ButtonVariant, TextStyle> = {
    primary:   { color: colors.textInverse },
    secondary: { color: colors.primary },
    danger:    { color: colors.textInverse },
    outline:   { color: colors.primary },
    ghost:     { color: colors.primary },
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.9}
      onPressIn={() => pressTo(0.97)}
      onPressOut={() => pressTo(1)}
      style={fullWidth ? styles.fullWidth : undefined}
    >
      <Animated.View
        style={[
          styles.base,
          variantStyles[variant],
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabled,
          { transform: [{ scale }] },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'outline' || variant === 'ghost' ? colors.primary : colors.textInverse}
          />
        ) : (
          <Text style={[styles.text, variantTextStyles[variant], textStyle]}>
            {title}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fullWidth: { alignSelf: 'stretch' },
  disabled:  { opacity: 0.55 },
  text:      { fontSize: 14, fontWeight: '700' },
});

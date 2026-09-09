import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
} from 'react-native';

interface AnimatedPressableProps extends PressableProps {
  /** Scale applied while pressed. Default 0.96. */
  pressScale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * A Pressable that gives subtle spring scale feedback on press — the kind of
 * micro-interaction that makes taps feel responsive and "app-like". Uses the
 * native driver so it never blocks the JS thread.
 */
export const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  pressScale = 0.96,
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  const handlePressIn = (e: GestureResponderEvent) => {
    animateTo(pressScale);
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    animateTo(1);
    onPressOut?.(e);
  };

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} {...rest}>
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

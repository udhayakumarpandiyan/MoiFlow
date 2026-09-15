import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

interface FadeInViewProps {
  /** Delay before the animation starts (ms). Default 0. */
  delay?: number;
  /** Animation duration (ms). Default 320. */
  duration?: number;
  /** Initial upward offset in px that eases to 0. Default 12. */
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Fades + slides its children in on mount — a lightweight, native-driven
 * entrance used to make screens/sections feel polished on load. Wrap content
 * (or stagger multiple with increasing `delay`) for a professional reveal.
 */
export const FadeInView: React.FC<FadeInViewProps> = ({
  delay = 0,
  duration = 320,
  offsetY = 12,
  style,
  children,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(offsetY)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [opacity, translateY, delay, duration]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
};

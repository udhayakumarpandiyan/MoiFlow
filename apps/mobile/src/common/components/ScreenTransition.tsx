import React, { useCallback, useRef } from 'react';
import { Animated, StyleProp, ViewStyle, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

interface ScreenTransitionProps {
  /** Fade/slide duration in ms. Default 260. */
  duration?: number;
  /** Initial vertical offset that eases to 0. Default 10. */
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Wraps a tab screen so its content crossfades + gently rises each time the tab
 * gains focus, giving smooth tab-change transitions on top of the navigator's
 * own switch. Native-driven, so it never blocks the JS thread. Resets on blur
 * so re-focusing always replays the entrance.
 */
export const ScreenTransition: React.FC<ScreenTransitionProps> = ({
  duration = 260,
  offsetY = 10,
  style,
  children,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(offsetY)).current;

  useFocusEffect(
    useCallback(() => {
      opacity.setValue(0);
      translateY.setValue(offsetY);
      const anim = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 14,
          bounciness: 4,
        }),
      ]);
      anim.start();
      return () => {
        anim.stop();
      };
    }, [opacity, translateY, duration, offsetY]),
  );

  return (
    <Animated.View
      style={[styles.fill, { opacity, transform: [{ translateY }] }, style]}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

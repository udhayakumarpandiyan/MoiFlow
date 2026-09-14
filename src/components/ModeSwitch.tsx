import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTranslation } from '../hooks/useAppTranslation';

const BLUE        = '#3B82F6';
const TRACK_BG    = '#d7d9dd';
const ACTIVE_FG   = '#FFFFFF';
const INACTIVE_FG = '#3c3f43';

const TIMING_CONFIG = {
  useNativeDriver: false,
  duration: 450,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1), // smooth ease-in-out
};

type AppMode = 'moi' | 'finance';

interface ModeSwitchProps {
  current: AppMode;
}

export const ModeSwitch: React.FC<ModeSwitchProps> = ({ current }) => {
  const { t } = useAppTranslation();
  const navigation = useNavigation<any>();

  const [slotWidth, setSlotWidth] = useState(0);

  // 0 = Moi side, 1 = Finance side (drives thumb translateX and label colors)
  const progress = useRef(new Animated.Value(current === 'finance' ? 1 : 0)).current;

  useEffect(() => {
    if (slotWidth === 0) return;
    Animated.timing(progress, {
      toValue: current === 'finance' ? 1 : 0,
      ...TIMING_CONFIG,
    }).start();
  }, [current, slotWidth, progress]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const total = e.nativeEvent.layout.width;
      // Track has padding: 3 on all sides, so inner width = total - 6 (left+right).
      // Two equal slots each take half of that.
      const slot = (total - 6) / 2;
      setSlotWidth(slot);
      // Snap without animation on first measure
      progress.setValue(current === 'finance' ? 1 : 0);
    },
    [current, progress],
  );

  const go = (mode: AppMode) => {
    if (mode === current) return;
    Animated.timing(progress, {
      toValue: mode === 'finance' ? 1 : 0,
      ...TIMING_CONFIG,
    }).start();
    navigation.navigate(mode === 'moi' ? 'MainTab' : 'FinanceTab');
  };

  // Thumb translateX: 0 → slotWidth
  const thumbX = slotWidth > 0
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, slotWidth] })
    : undefined;

  // Moi label: active (white) when progress=0, inactive when progress=1
  const moiColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [ACTIVE_FG, INACTIVE_FG],
  });

  // Finance label: inactive when progress=0, active (white) when progress=1
  const financeColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [INACTIVE_FG, ACTIVE_FG],
  });

  return (
    <View style={styles.track} onLayout={onLayout}>
      {/* Sliding thumb */}
      {slotWidth > 0 && thumbX !== undefined && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { width: slotWidth, transform: [{ translateX: thumbX }] },
          ]}
        />
      )}

      {/* Moi slot */}
      <Pressable
        style={styles.slot}
        onPress={() => go('moi')}
        accessibilityRole="button"
        accessibilityState={{ selected: current === 'moi' }}
      >
        <Animated.Text style={[styles.label, { color: moiColor }]}>
          {t('mode.moi')}
        </Animated.Text>
      </Pressable>

      {/* Finance slot */}
      <Pressable
        style={styles.slot}
        onPress={() => go('finance')}
        accessibilityRole="button"
        accessibilityState={{ selected: current === 'finance' }}
      >
        <Animated.Text style={[styles.label, { color: financeColor }]}>
          {t('mode.finance')}
        </Animated.Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: TRACK_BG,
    borderRadius: 20,
    padding: 3,               // uniform 3px on all sides
    alignSelf: 'flex-start',
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,                  // align to inner content edge, same as top/bottom inset
    borderRadius: 17,
    backgroundColor: BLUE,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  slot: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    paddingLeft: 8,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});

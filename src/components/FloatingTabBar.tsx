import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@react-native-vector-icons/feather';

import { useTheme, ThemeColors } from '../context/ThemeContext';
import CalendarDayIcon from './CalendarDayIcon';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

/** Default (Moi) icon map. Finance passes its own via the `iconMap` prop. */
const ICON_MAP: Record<string, FeatherIconName> = {
  DashboardStack: 'home',
  EntriesStack: 'list',
  EventsStack: 'calendar',
  ReportsStack: 'bar-chart-2',
  SettingsStack: 'settings',
};

/** Extra props so the same bar can drive both Moi and Finance tab navigators. */
interface FloatingTabBarExtraProps {
  /** Route-name → Feather icon. Defaults to the Moi ICON_MAP. */
  iconMap?: Record<string, FeatherIconName>;
  /** Route names to omit from the bar (e.g. Moi hides 'SettingsStack'). */
  hiddenRoutes?: string[];
}

// Brand green used for the selected tab, independent of the active theme's
// `primary` (which is blue in the plain light palette). Lighter in dark mode.
const SELECTED_GREEN_LIGHT = '#09a564';
const SELECTED_GREEN_DARK = '#3DC98A';
const SELECTED_GREEN_BG_LIGHT = '#E5F7EF';
const SELECTED_GREEN_BG_DARK = 'rgba(61,201,138,0.16)';

/**
 * A modern floating bottom tab bar: a rounded, elevated pill detached from the
 * screen edges. Each item has a FIXED footprint (icon + label below) so nothing
 * resizes on selection — only the highlight pill fades in and the icon/label
 * tint animates. This avoids the layout "jump" glitch of a growing pill.
 */
export const FloatingTabBar: React.FC<BottomTabBarProps & FloatingTabBarExtraProps> = ({
  state,
  descriptors,
  navigation,
  iconMap = ICON_MAP,
  hiddenRoutes = ['SettingsStack'],
}) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const selectedColor = isDark ? SELECTED_GREEN_DARK : SELECTED_GREEN_LIGHT;
  const selectedBg = isDark ? SELECTED_GREEN_BG_DARK : SELECTED_GREEN_BG_LIGHT;

  // By default Settings is reachable from the header profile menu (no tab button).
  const visibleRoutes = state.routes.filter(r => !hiddenRoutes.includes(r.name));

  return (
    <View
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) + 5 }]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        {visibleRoutes.map(route => {
          const index = state.routes.findIndex(r => r.key === route.key);
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name.replace('Stack', '');
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              routeName={route.name}
              icon={iconMap[route.name] ?? 'circle'}
              label={label}
              focused={focused}
              colors={colors}
              selectedColor={selectedColor}
              selectedBg={selectedBg}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
};

interface TabItemProps {
  routeName: string;
  icon: FeatherIconName;
  label: string;
  focused: boolean;
  colors: ThemeColors;
  selectedColor: string;
  selectedBg: string;
  onPress: () => void;
}

const TabItem: React.FC<TabItemProps> = ({
  routeName,
  icon,
  label,
  focused,
  colors,
  selectedColor,
  selectedBg,
  onPress,
}) => {
  // Single driver: 0 = inactive, 1 = active. Drives highlight opacity only, so
  // there's no width/layout change and therefore no selection glitch.
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  // Press feedback: scales the whole item down while held, springs back on release.
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [focused, anim]);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 10,
    }).start();
  };

  const color = focused ? selectedColor : colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={{ color: selectedBg, borderless: true, radius: 34 }}
      style={itemStyles.itemPressable}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
    >
      <Animated.View
        style={[itemStyles.itemContent, { transform: [{ scale: pressScale }] }]}
      >
        <View style={itemStyles.itemInner}>
          {/* Highlight pill — fixed size, only fades/scales (native driver). */}
          <Animated.View
            pointerEvents="none"
            style={[
              itemStyles.highlight,
              {
                backgroundColor: selectedBg,
                opacity: anim,
                // Soft glow lift under the active tab, tinted with the brand green.
                shadowColor: selectedColor,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.45,
                shadowRadius: 6,
                elevation: 4,
                transform: [
                  {
                    scale: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 1],
                    }),
                  },
                ],
              },
            ]}
          />
          {routeName === 'EventsStack' ? (
            <CalendarDayIcon color={color} size={22} />
          ) : (
            <Feather name={icon} size={22} color={color} />
          )}
        </View>

        {/* Label always occupies its slot — no reflow when selection changes. */}
        <Text
          style={[itemStyles.label, { color }, focused && itemStyles.labelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

// Layout styles are theme-independent, so they live in a static sheet that both
// the bar and the items can reference.
const itemStyles = StyleSheet.create({
  itemPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    borderRadius: 20,
  },
  itemContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInner: {
    width: 44,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlight: {
    ...StyleSheet.absoluteFill,
    borderRadius: 17,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  labelActive: {
    fontWeight: '800',
  },
});

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    wrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      width: '92%',
      backgroundColor: colors.surface,
      borderRadius: 26,
      paddingHorizontal: 6,
      paddingVertical: 8,
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.5 : 0.18,
      shadowRadius: 20,
      elevation: 18,
    },
  });

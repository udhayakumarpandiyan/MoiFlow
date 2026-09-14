import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type LogoSize = 'small' | 'medium' | 'large';
type LogoVariant = 'icon-only' | 'full' | 'header';

interface MoiflowLogoProps {
  color?: string;
  size?: LogoSize;
  /** 'icon-only' = just the icon, 'full' = icon + text stacked, 'header' = text logo for nav bar */
  variant?: LogoVariant;
}

const sizeConfig = {
  small:  { iconSize: 28, fontSize: 14, iconBg: 32, borderRadius: 8 },
  medium: { iconSize: 36, fontSize: 24, iconBg: 48, borderRadius: 14 },
  large:  { iconSize: 48, fontSize: 32, iconBg: 64, borderRadius: 18 },
};

const logoSquare = require('../assets/logo/moiflow-logo-temp.png');

const MoiflowLogo: React.FC<MoiflowLogoProps> = ({
  color = '#FFFFFF',
  size = 'medium',
  variant = 'icon-only',
}) => {
  const { isDark } = useTheme();
  const config = sizeConfig[size];

  if (variant === 'header') {
    // Day / default mode: render the original PNG wordmark unchanged.
    // Night mode: composed layout — app icon (original colors) + text-only
    // inversion so the icon graphic stays untouched.
    if (!isDark) {
      return (
        <Image
          source={require('../assets/logo/moiflow-logo-temp.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
      );
    }

    return (
      <View style={styles.headerRow}>
        <Image
          source={require('../assets/app-icon/moiflow-app-icon-192.png')}
          style={styles.headerIcon}
          resizeMode="contain"
        />
        <Text style={[styles.headerText, { color: '#F1F5F9' }]}>
          <Text style={styles.headerBold}>Moi</Text>
          <Text style={styles.headerLight}>Flow</Text>
        </Text>
      </View>
    );
  }

  if (variant === 'full') {
    return (
      <View style={styles.fullContainer}>
        <View style={[styles.iconBg, { width: config.iconBg, height: config.iconBg, borderRadius: config.borderRadius, backgroundColor: `${color}15` }]}>
          <Image
            source={logoSquare}
            style={{ width: config.iconSize, height: config.iconSize }}
            resizeMode="contain"
          />
        </View>
      </View>
    );
  }

  // icon-only (default)
  return (
    <View style={[styles.iconBg, { width: config.iconBg, height: config.iconBg, borderRadius: config.borderRadius, backgroundColor: `${color}15` }]}>
      <Image
        source={logoSquare}
        style={{ width: config.iconSize, height: config.iconSize }}
        resizeMode="contain"
      />
    </View>
  );
};

export default MoiflowLogo;

const styles = StyleSheet.create({
  headerLogo: {
    // Width matches the PNG's natural aspect ratio at height 42 (994/320 * 42 ≈ 130)
    // so `contain` doesn't add horizontal whitespace around the artwork.
    width: 130,
    height: 42,
    marginLeft: -4, // compensate for transparent left-padding baked into the asset
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 7,
  },
  headerText: {
    fontSize: 20,
    letterSpacing: 0.3,
  },
  headerBold: {
    fontWeight: '800',
  },
  headerLight: {
    fontWeight: '400',
  },
  iconBg: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullContainer: {
    alignItems: 'center',
    gap: 12,
  },
});

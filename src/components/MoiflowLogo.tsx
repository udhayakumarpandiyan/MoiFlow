import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

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
  const config = sizeConfig[size];

  if (variant === 'header') {
    // App icon + text logo that adapts to any header background color
    return (
      <View style={styles.headerContainer}>
        <Image
          source={require('../assets/app-icon/moiflow-app-icon-48.png')}
          style={styles.headerIcon}
          resizeMode="contain"
        />
        <Text style={[styles.headerText, { color }]}>
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
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  headerText: {
    fontSize: 18,
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

import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

type LogoSize = 'small' | 'medium' | 'large';
type LogoVariant = 'icon-only' | 'full' | 'header';

interface MoiflowLogoProps {
  color?: string;
  size?: LogoSize;
  /** 'icon-only' = just the icon, 'full' = icon + text stacked, 'header' = icon + text in a row */
  variant?: LogoVariant;
}

const sizeConfig = {
  small:  { iconSize: 28, fontSize: 14, iconBg: 32, borderRadius: 8 },
  medium: { iconSize: 36, fontSize: 24, iconBg: 48, borderRadius: 14 },
  large:  { iconSize: 48, fontSize: 32, iconBg: 64, borderRadius: 18 },
};

// Use the square logo for icon display
const logoSquare = require('../assets/logo/moiflow-logo-temp.png');
// Use the wide logo for header display
const logoWide = require('../assets/logo/moiflow-logo-temp.png');

const headerLogoHeight = {
  small: 34,
  medium: 42,
  large: 50,
};

const MoiflowLogo: React.FC<MoiflowLogoProps> = ({
  color = '#FFFFFF',
  size = 'medium',
  variant = 'icon-only',
}) => {
  const config = sizeConfig[size];

  if (variant === 'header') {
    return (
      <View style={styles.headerLogoBg}>
        <Image
          source={logoWide}
          style={{ width: 120, height: 34 }}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (variant === 'full') {
    return (
      <View style={styles.fullContainer}>
        <View style={[styles.iconBgLarge, { width: config.iconBg, height: config.iconBg, borderRadius: config.borderRadius, backgroundColor: `${color}15` }]}>
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
    <View style={[styles.iconBgLarge, { width: config.iconBg, height: config.iconBg, borderRadius: config.borderRadius, backgroundColor: `${color}15` }]}>
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
    backgroundColor:'#eaeaea',
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 20,
    gap: 10,
  },
  headerLogoBg: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBg: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBgLarge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBrand: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerMoi: {
    fontWeight: '800',
  },
  headerFlow: {
    fontWeight: '500',
  },
  fullContainer: {
    alignItems: 'center',
    gap: 12,
  },
  fullBrand: {
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});

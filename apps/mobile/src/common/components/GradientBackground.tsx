import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';

/**
 * A dependency-free vertical gradient background.
 *
 * The app has no native gradient library installed (and native linking has been
 * kept intentionally minimal), so this simulates a smooth gradient by stacking
 * absolutely-positioned bands whose opacity ramps from top to bottom over a
 * solid base color. With enough bands the banding is imperceptible.
 *
 * Pass an ordered list of `colors` (top → bottom). The first color is used as
 * the solid base; subsequent colors are layered as fading bands so the eye
 * reads a continuous blend.
 */
interface GradientBackgroundProps {
  /** Gradient stops, top → bottom. At least one color. */
  colors: string[];
  /** Number of interpolation bands. More = smoother. Default 24. */
  steps?: number;
  /** Max opacity applied to the top-most overlay tint. Default 1. */
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** Parse a #RRGGBB / #RGB string into [r,g,b]. Falls back to black. */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h
      .split('')
      .map(c => c + c)
      .join('');
  }
  const int = parseInt(h, 16);
  if (Number.isNaN(int) || h.length !== 6) return [0, 0, 0];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** Linear interpolate a multi-stop color ramp at position t in [0,1]. */
function sampleRamp(stops: [number, number, number][], t: number): [number, number, number] {
  if (stops.length === 1) return stops[0];
  const scaled = t * (stops.length - 1);
  const i = Math.min(Math.floor(scaled), stops.length - 2);
  const frac = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
  colors,
  steps = 24,
  intensity = 1,
  style,
  children,
}) => {
  const stops = (colors.length ? colors : ['#000000']).map(hexToRgb);
  const base = stops[0];

  const bands = Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const [r, g, b] = sampleRamp(stops, t);
    // Each band occupies an equal vertical slice; a small overlap + soft alpha
    // blends neighbours into a continuous ramp.
    return (
      <View
        key={i}
        pointerEvents="none"
        style={[
          styles.band,
          {
            top: `${(i / steps) * 100}%`,
            height: `${(1 / steps) * 100 + 1}%`,
            backgroundColor: `rgba(${r},${g},${b},${Math.min(1, intensity)})`,
          },
        ]}
      />
    );
  });

  return (
    <View style={[styles.container, { backgroundColor: `rgb(${base[0]},${base[1]},${base[2]})` }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {bands}
      </View>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});

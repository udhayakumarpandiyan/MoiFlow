import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CalendarDayIconProps {
  color: string;
  size?: number;
}

/**
 * A custom calendar icon that shows today's date inside a calendar outline.
 * Used in the tab bar for the Events tab.
 */
const CalendarDayIcon: React.FC<CalendarDayIconProps> = ({ color, size = 22 }) => {
  const today = new Date().getDate();
  const scale = size / 22;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Calendar top bar (header with "rings") */}
      <View style={[styles.header, { backgroundColor: color, borderColor: color }]}>
        <View style={[styles.ring, { backgroundColor: color }]} />
        <View style={[styles.ring, { backgroundColor: color }]} />
      </View>
      {/* Calendar body */}
      <View style={[styles.body, { borderColor: color }]}>
        <Text
          style={[
            styles.dayText,
            { color, fontSize: 10 * scale, lineHeight: 12 * scale },
          ]}
          allowFontScaling={false}
        >
          {today}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    width: '100%',
    height: 5,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
  },
  ring: {
    width: 2,
    height: 4,
    borderRadius: 1,
    marginTop: -2,
  },
  body: {
    flex: 1,
    width: '100%',
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontWeight: '800',
    textAlign: 'center',
  },
});

export default CalendarDayIcon;

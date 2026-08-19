import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  ViewStyle,
} from 'react-native';
import Feather from '@react-native-vector-icons/feather';
import { useTheme } from '../context/ThemeContext';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: ViewStyle;
  onClear?: () => void;
  /** When provided, a mic button is shown. Callback receives recognised text. */
  onVoiceSearch?: () => void;
  /** Set true while voice recognition is active to show pulsing indicator */
  voiceActive?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = 'Search...',
  style,
  onClear,
  onVoiceSearch,
  voiceActive = false,
}) => {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: voiceActive ? colors.primary : colors.border,
          borderWidth: voiceActive ? 2 : 1,
        },
        style,
      ]}
    >
      <Feather name="search" size={16} color={colors.textMuted} style={styles.icon} />
      <TextInput
        style={[styles.input, { color: colors.textPrimary }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => {
            onChangeText('');
            onClear?.();
          }}
          style={styles.clearButton}
        >
          <Text style={[styles.clearText, { color: colors.textMuted }]}>?</Text>
        </TouchableOpacity>
      ) : null}
      {onVoiceSearch ? (
        <TouchableOpacity
          onPress={onVoiceSearch}
          style={[styles.micButton, voiceActive && { backgroundColor: colors.primaryBg }]}
          activeOpacity={0.7}
        >
          <Feather name={voiceActive ? 'square' : 'mic'} size={18} color={voiceActive ? colors.error : colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  clearButton: {
    padding: 4,
  },
  clearText: {
    fontSize: 13,
  },
  micButton: {
    marginLeft: 6,
    padding: 6,
    borderRadius: 8,
  },
});

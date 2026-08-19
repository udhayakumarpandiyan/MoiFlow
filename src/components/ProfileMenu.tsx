import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { authService } from '../services/AuthService';
import Feather from '@react-native-vector-icons/feather';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogoutButtonProps {
  onSignOut: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const LogoutButton: React.FC<LogoutButtonProps> = ({ onSignOut }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const handlePress = () => {
    Alert.alert(
      t('profile.signOut'),
      t('profile.confirmSignOut'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.signOut'),
          style: 'destructive',
          onPress: async () => {
            await authService.signOut();
            onSignOut();
          },
        },
      ],
    );
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.container, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
      activeOpacity={0.7}
      accessibilityLabel={t('profile.signOut')}
      accessibilityRole="button"
    >
      <Feather name="log-out" size={18} color={colors.textInverse} />
    </TouchableOpacity>
  );
};

// Keep backward-compatible export name so MainTabNavigator doesn't need changes
export const ProfileMenu = LogoutButton;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
});
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen     from '../../../features/settings/Settings';
import PinSetupScreen     from '../../../screens/PinSetupScreen';
import PatternSetupScreen from '../../../screens/PatternSetupScreen';

const Stack = createNativeStackNavigator();

const SettingsStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="Settings"
      component={SettingsScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="PinSetup"
      component={PinSetupScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="PatternSetup"
      component={PatternSetupScreen}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

export default SettingsStack;
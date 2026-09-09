import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LazyScreen } from '../../../components/LazyScreen';

const LazySettings = React.lazy(() => import('../../../features/settings/Settings'));
const LazyPinSetup = React.lazy(() => import('../../../screens/PinSetupScreen'));
const LazyPremium = React.lazy(() => import('../../../features/premium/PremiumScreen'));

const Stack = createNativeStackNavigator();

const SettingsScreen = (props: any) => (
  <LazyScreen>
    <LazySettings {...props} />
  </LazyScreen>
);

const PinSetupScreenWrapper = (props: any) => (
  <LazyScreen>
    <LazyPinSetup {...props} />
  </LazyScreen>
);

const PremiumScreenWrapper = (props: any) => (
  <LazyScreen>
    <LazyPremium {...props} />
  </LazyScreen>
);

const SettingsStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="Settings"
      component={SettingsScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="PinSetup"
      component={PinSetupScreenWrapper}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="Premium"
      component={PremiumScreenWrapper}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

export default SettingsStack;

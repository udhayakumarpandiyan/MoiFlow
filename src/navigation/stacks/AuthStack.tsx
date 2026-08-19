import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PinSetupScreen     from '../../screens/PinSetupScreen';
import PatternSetupScreen from '../../screens/PatternSetupScreen';

const Stack = createNativeStackNavigator();

interface Props {
  initialRoute?: 'PinSetup' | 'PatternSetup';
  onSuccess?: () => void;
}

const AuthStack: React.FC<Props> = ({
  initialRoute = 'PinSetup',
  onSuccess,
}) => {
  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name="PinSetup"
        component={PinSetupScreen}
        initialParams={{ onSuccess }}
      />
      <Stack.Screen
        name="PatternSetup"
        component={PatternSetupScreen}
        initialParams={{ onSuccess }}
      />
    </Stack.Navigator>
  );
};

export default AuthStack;
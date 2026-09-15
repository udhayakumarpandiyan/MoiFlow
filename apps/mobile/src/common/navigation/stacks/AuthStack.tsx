import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PinSetupScreen from '@common/screens/PinSetupScreen';

const Stack = createNativeStackNavigator();

interface Props {
  initialRoute?: 'PinSetup';
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
    </Stack.Navigator>
  );
};

export default AuthStack;

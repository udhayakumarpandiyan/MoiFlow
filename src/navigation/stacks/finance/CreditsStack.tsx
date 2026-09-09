import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CreditsScreen from '../../../features/finance/ComingSoonScreen';

const Stack = createNativeStackNavigator();

const CreditsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Credits" component={CreditsScreen} />
  </Stack.Navigator>
);

export default CreditsStack;

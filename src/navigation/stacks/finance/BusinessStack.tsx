import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BusinessScreen } from '../../../features/finance/ComingSoonScreen';

const Stack = createNativeStackNavigator();

const BusinessStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Business" component={BusinessScreen} />
  </Stack.Navigator>
);

export default BusinessStack;

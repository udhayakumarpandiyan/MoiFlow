import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FinanceReportsScreen } from '../../../features/finance/ComingSoonScreen';

const Stack = createNativeStackNavigator();

const FinanceReportsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="FinanceReports" component={FinanceReportsScreen} />
  </Stack.Navigator>
);

export default FinanceReportsStack;

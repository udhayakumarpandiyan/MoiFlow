import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Reports from '../../../features/reports/Reports';

const Stack = createNativeStackNavigator();

const ReportsStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="Reports"
      component={Reports}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

export default ReportsStack;
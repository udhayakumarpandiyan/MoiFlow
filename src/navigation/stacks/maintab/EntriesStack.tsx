import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import EntriesScreen from '../../../features/entries/Entries';

const Stack = createNativeStackNavigator();

const EntriesStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="Entries"
      component={EntriesScreen}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

export default EntriesStack;
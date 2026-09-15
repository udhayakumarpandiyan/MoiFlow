import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Events from '@moi/screens/events/Events';

const Stack = createNativeStackNavigator();

const EventsStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Events"
        component={Events}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

export default EventsStack;

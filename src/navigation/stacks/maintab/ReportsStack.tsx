import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LazyScreen } from '../../../components/LazyScreen';

const LazyReports = React.lazy(() => import('../../../features/reports/Reports'));

const Stack = createNativeStackNavigator();

const ReportsScreen = (props: any) => (
  <LazyScreen>
    <LazyReports {...props} />
  </LazyScreen>
);

const ReportsStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="Reports"
      component={ReportsScreen}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

export default ReportsStack;

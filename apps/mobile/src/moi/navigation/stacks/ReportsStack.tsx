import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LazyScreen } from '@common/components/LazyScreen';

const LazyReports = React.lazy(() => import('@moi/screens/reports/Reports'));
const LazyPersonHistory = React.lazy(() => import('@moi/screens/reports/PersonHistoryScreen'));

const Stack = createNativeStackNavigator();

const ReportsScreen = (props: any) => (
  <LazyScreen>
    <LazyReports {...props} />
  </LazyScreen>
);

const PersonHistoryScreen = (props: any) => (
  <LazyScreen>
    <LazyPersonHistory {...props} />
  </LazyScreen>
);

const ReportsStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="Reports"
      component={ReportsScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="PersonHistory"
      component={PersonHistoryScreen}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

export default ReportsStack;

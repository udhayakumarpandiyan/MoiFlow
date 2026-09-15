import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LazyScreen } from '@common/components/LazyScreen';

const LazyDashboard = React.lazy(() => import('@finance/screens/FinanceDashboardScreen'));

const Stack = createNativeStackNavigator();

const DashboardScreen = (props: any) => (
  <LazyScreen>
    <LazyDashboard {...props} />
  </LazyScreen>
);

const FinanceDashboardStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="FinanceDashboard" component={DashboardScreen} />
  </Stack.Navigator>
);

export default FinanceDashboardStack;

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LazyScreen } from '../../../components/LazyScreen';

const LazyFinanceReports = React.lazy(
  () => import('../../../features/finance/FinanceReportsScreen'),
);

const Stack = createNativeStackNavigator();

const wrap = <P extends object>(Comp: React.LazyExoticComponent<React.ComponentType<P>>) => {
  const Screen = (props: P) => (
    <LazyScreen>
      <Comp {...props} />
    </LazyScreen>
  );
  return Screen;
};

const FinanceReportsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="FinanceReports" component={wrap(LazyFinanceReports)} />
  </Stack.Navigator>
);

export default FinanceReportsStack;

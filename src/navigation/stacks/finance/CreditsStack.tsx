import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LazyScreen } from '../../../components/LazyScreen';

const LazyCredits = React.lazy(() => import('../../../features/finance/CreditsScreen'));
const LazyAddEditCredit = React.lazy(() => import('../../../features/finance/AddEditCreditScreen'));
const LazyCreditDetail = React.lazy(() => import('../../../features/finance/CreditDetailScreen'));

const Stack = createNativeStackNavigator();

const wrap = (Comp: React.LazyExoticComponent<React.ComponentType<any>>) => {
  const Screen = (props: any) => (
    <LazyScreen>
      <Comp {...props} />
    </LazyScreen>
  );
  return Screen;
};

const CreditsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Credits" component={wrap(LazyCredits)} />
    <Stack.Screen name="AddEditCredit" component={wrap(LazyAddEditCredit)} />
    <Stack.Screen name="CreditDetail" component={wrap(LazyCreditDetail)} />
  </Stack.Navigator>
);

export default CreditsStack;

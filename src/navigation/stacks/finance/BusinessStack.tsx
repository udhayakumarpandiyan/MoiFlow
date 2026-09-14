import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LazyScreen } from '../../../components/LazyScreen';

const LazyBusiness = React.lazy(() => import('../../../features/finance/business/BusinessScreen'));
const LazyPartyDetail = React.lazy(() => import('../../../features/finance/business/PartyDetailScreen'));
const LazyAddEditParty = React.lazy(() => import('../../../features/finance/business/AddEditPartyScreen'));
const LazyTransactionDetail = React.lazy(() => import('../../../features/finance/business/TransactionDetailScreen'));
const LazyAddEditTransaction = React.lazy(() => import('../../../features/finance/business/AddEditTransactionScreen'));

const Stack = createNativeStackNavigator();

const wrap = <P extends object>(Comp: React.LazyExoticComponent<React.ComponentType<P>>) => {
  const Screen = (props: P) => (
    <LazyScreen>
      <Comp {...props} />
    </LazyScreen>
  );
  return Screen;
};

const BusinessStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Business" component={wrap(LazyBusiness)} />
    <Stack.Screen name="PartyDetail" component={wrap(LazyPartyDetail)} />
    <Stack.Screen name="AddEditParty" component={wrap(LazyAddEditParty)} />
    <Stack.Screen name="TransactionDetail" component={wrap(LazyTransactionDetail)} />
    <Stack.Screen name="AddEditTransaction" component={wrap(LazyAddEditTransaction)} />
  </Stack.Navigator>
);

export default BusinessStack;

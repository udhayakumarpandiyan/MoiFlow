import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LazyScreen } from '../../../components/LazyScreen';

const LazyLoans = React.lazy(() => import('../../../features/finance/LoansScreen'));
const LazyAddEditLoan = React.lazy(() => import('../../../features/finance/AddEditLoanScreen'));
const LazyLoanDetail = React.lazy(() => import('../../../features/finance/LoanDetailScreen'));

const Stack = createNativeStackNavigator();

const wrap = (Comp: React.LazyExoticComponent<React.ComponentType<any>>) => {
  const Screen = (props: any) => (
    <LazyScreen>
      <Comp {...props} />
    </LazyScreen>
  );
  return Screen;
};

const LoansStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Loans" component={wrap(LazyLoans)} />
    <Stack.Screen name="AddEditLoan" component={wrap(LazyAddEditLoan)} />
    <Stack.Screen name="LoanDetail" component={wrap(LazyLoanDetail)} />
  </Stack.Navigator>
);

export default LoansStack;

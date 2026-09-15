import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LazyScreen } from '@common/components/LazyScreen';

const LazyLoans = React.lazy(() => import('@finance/screens/LoansScreen'));
const LazyAddEditLoan = React.lazy(() => import('@finance/screens/AddEditLoanScreen'));
const LazyLoanDetail = React.lazy(() => import('@finance/screens/LoanDetailScreen'));

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

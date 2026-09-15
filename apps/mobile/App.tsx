import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import {
  SafeAreaProvider
} from 'react-native-safe-area-context';
import RootNavigator from './src/common/navigation/RootNavigator';
import { ThemeProvider } from './src/common/context/ThemeContext';
import { EntitlementProvider } from './src/common/context/EntitlementContext';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <ThemeProvider>
      <EntitlementProvider>
        <SafeAreaProvider>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <AppContent />
        </SafeAreaProvider>
      </EntitlementProvider>
    </ThemeProvider>
  );
}

function AppContent() {

  return (
    <View style={styles.container}>
      <RootNavigator/>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;

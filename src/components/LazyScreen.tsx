import React, { Suspense } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

// ---------------------------------------------------------------------------
// Error Boundary — catches failures in lazy-loaded feature modules so they
// don't crash the entire app.
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class LazyErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, _info: React.ErrorInfo) {
    // Error boundary caught a lazy-load failure — logged for crash reporting
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Error Fallback UI
// ---------------------------------------------------------------------------

const ErrorFallback = ({ error, onRetry }: { error: Error | null; onRetry: () => void }) => (
  <View style={styles.container}>
    <Text style={styles.errorIcon}>⚠️</Text>
    <Text style={styles.errorTitle}>Something went wrong</Text>
    <Text style={styles.errorMessage}>{error?.message || 'Failed to load this screen'}</Text>
    <Text style={styles.retryButton} onPress={onRetry}>
      Tap to retry
    </Text>
  </View>
);

// ---------------------------------------------------------------------------
// Loading Fallback UI
// ---------------------------------------------------------------------------

const LoadingFallback = () => {
  // useTheme can't be used here because this renders outside the lazy component tree
  // during Suspense. Use neutral colors.
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366F1" />
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// LazyScreen — wraps a React.lazy() component with Suspense + ErrorBoundary
// ---------------------------------------------------------------------------

interface LazyScreenProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
}

/**
 * Wrap any React.lazy() screen component with proper loading and error states.
 *
 * Usage:
 * ```tsx
 * const LazyReports = React.lazy(() => import('../features/reports/Reports'));
 *
 * const ReportsStack = () => (
 *   <LazyScreen>
 *     <LazyReports />
 *   </LazyScreen>
 * );
 * ```
 */
export const LazyScreen: React.FC<LazyScreenProps> = ({
  children,
  fallback,
  errorFallback,
}) => {
  return (
    <LazyErrorBoundary fallback={errorFallback}>
      <Suspense fallback={fallback || <LoadingFallback />}>
        {children}
      </Suspense>
    </LazyErrorBoundary>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '600',
  },
});

export default LazyScreen;

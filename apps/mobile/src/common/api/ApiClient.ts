import AsyncStorage from '@react-native-async-storage/async-storage';

// const API_BASE_URL = __DEV__
//   ? 'http://192.168.0.5:8000'
//   : 'https://api.moiflow.in'; // Production API base URL

const API_BASE_URL = 'https://api.moiflow.in'; // Production API base URL

const AUTH_TOKEN_KEY = 'auth.session_token';

/**
 * Get the stored auth token for authenticated requests.
 */
async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Core API request function with automatic auth token injection.
 *
 * @param path - API endpoint path (e.g., '/api/auth/send-otp')
 * @param options - Standard RequestInit options
 * @param authenticated - Whether to include auth token (default: false)
 */
export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
  authenticated: boolean = false,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authenticated) {
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...options,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Unknown error');

    // Handle auth-specific errors
    if (response.status === 401) {
      // Token expired or invalid — clear stored token
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    }

    throw new Error(
      `API Error ${response.status}: ${message}`,
    );
  }

  return response.json();
}

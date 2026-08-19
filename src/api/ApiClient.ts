const API_BASE_URL =
  'http://192.168.0.3:8000';

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    },
  );

  if (!response.ok) {
    const message =
      await response.text();

    throw new Error(
      `API Error ${response.status}: ${message}`,
    );
  }

  return response.json();
}
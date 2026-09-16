/**
 * HTTP client for the MoiFlow admin backend.
 *
 * All requests are base-pathed at `/api/admin` and routed through the Vite dev
 * proxy to the FastAPI backend. The admin JWT is read from localStorage and
 * sent as an Authorization Bearer header on every request except login.
 *
 * On a 401 response the token is cleared and an `moiflow:admin-logout` event is
 * dispatched so the auth layer can redirect to the login page.
 */
import type {
  AdminSubscription,
  AdminUser,
  AiUsage,
  DashboardData,
  FinanceOverview,
  LoginResponse,
  MoiOverview,
  MutationResult,
  OtpActivityEntry,
  ActivityEntry,
  AdminProfile,
  SystemConfig,
  AdminAccount,
  CreateAdminInput,
  UpdateAdminInput,
} from './types';

const API_BASE = '/api/admin';

export const TOKEN_KEY = 'moiflow_admin_token';
export const NAME_KEY = 'moiflow_admin_name';
export const ROLE_KEY = 'moiflow_admin_role';

export const LOGOUT_EVENT = 'moiflow:admin-logout';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthStorage(token: string, name: string, role: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(ROLE_KEY, role);
}

export function clearAuthStorage(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function getStoredName(): string | null {
  return localStorage.getItem(NAME_KEY);
}

export function getStoredRole(): string | null {
  return localStorage.getItem(ROLE_KEY);
}

/** Raised when a request fails. `status` is the HTTP status when available. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function triggerLogout(): void {
  clearAuthStorage();
  window.dispatchEvent(new CustomEvent(LOGOUT_EVENT));
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  /** Skip attaching the Authorization header (used by login). */
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Network error. Please check your connection.', 0);
  }

  if (response.status === 401) {
    if (auth) triggerLogout();
    throw new ApiError('Unauthorized', 401);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { detail?: string; message?: string };
      message = data.detail || data.message || message;
    } catch {
      // Non-JSON error body; keep the default message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export interface ListParams {
  limit?: number;
  offset?: number;
}

function listQuery(params?: ListParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
  },

  me(): Promise<AdminProfile> {
    return request<AdminProfile>('/me');
  },

  dashboard(): Promise<DashboardData> {
    return request<DashboardData>('/dashboard');
  },

  users(params?: ListParams): Promise<AdminUser[]> {
    return request<AdminUser[]>(`/users${listQuery(params)}`);
  },

  subscriptions(params?: ListParams): Promise<AdminSubscription[]> {
    return request<AdminSubscription[]>(`/subscriptions${listQuery(params)}`);
  },

  moiOverview(): Promise<MoiOverview> {
    return request<MoiOverview>('/moi/overview');
  },

  financeOverview(): Promise<FinanceOverview> {
    return request<FinanceOverview>('/finance/overview');
  },

  aiUsage(): Promise<AiUsage> {
    return request<AiUsage>('/ai/usage');
  },

  otpActivity(params?: ListParams): Promise<OtpActivityEntry[]> {
    return request<OtpActivityEntry[]>(`/otp/activity${listQuery(params)}`);
  },

  audit(params?: ListParams): Promise<ActivityEntry[]> {
    return request<ActivityEntry[]>(`/audit${listQuery(params)}`);
  },

  config(): Promise<SystemConfig> {
    return request<SystemConfig>('/config');
  },

  deactivateUser(id: string): Promise<MutationResult> {
    return request<MutationResult>(`/users/${id}/deactivate`, { method: 'POST' });
  },

  // --- Admin-user management (superadmin only) ---
  admins(params?: ListParams): Promise<AdminAccount[]> {
    return request<AdminAccount[]>(`/admins${listQuery(params)}`);
  },

  createAdmin(input: CreateAdminInput): Promise<AdminAccount> {
    return request<AdminAccount>('/admins', { method: 'POST', body: input });
  },

  updateAdmin(id: string, input: UpdateAdminInput): Promise<AdminAccount> {
    return request<AdminAccount>(`/admins/${id}`, { method: 'PATCH', body: input });
  },
};

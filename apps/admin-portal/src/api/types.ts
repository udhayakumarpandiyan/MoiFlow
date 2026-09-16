/**
 * Typed models for the MoiFlow admin backend API.
 * These interfaces mirror the JSON returned by the FastAPI backend under
 * /api/admin. The frontend never touches a database directly.
 */

export type AdminRole = 'admin' | 'superadmin' | 'viewer' | string;

export interface LoginResponse {
  token: string;
  name: string;
  role: AdminRole;
}

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  last_login_at: string | null;
}

export interface DashboardUsers {
  total: number;
  active_7d: number;
  new_7d: number;
  new_30d: number;
  free: number;
  premium: number;
}

export interface DashboardSubscriptions {
  premium: number;
  distribution: Record<string, number>;
  estimated_revenue_inr: number;
}

export interface DashboardAi {
  total_calls: number;
  calls_30d: number;
}

export interface DashboardOtp {
  requests_24h: number;
}

export interface ActivityEntry {
  actor_type: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface DashboardData {
  users: DashboardUsers;
  subscriptions: DashboardSubscriptions;
  ai: DashboardAi;
  otp: DashboardOtp;
  recent_activity: ActivityEntry[];
}

export interface AdminUser {
  id: string;
  phone: string;
  name: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login_at: string | null;
  plan_id: string | null;
  is_premium: boolean;
}

export interface AdminSubscription {
  user_id: string;
  phone: string;
  plan_id: string | null;
  status: string;
  is_premium: boolean;
  store: string | null;
  expires_at: string | null;
  will_renew: boolean;
}

export interface MoiOverview {
  events: number;
  entries: number;
}

export interface FinanceOverview {
  credits: number;
  loans: number;
  business_txns: number;
}

export interface AiRecentCall {
  task: string;
  provider: string;
  domain: string | null;
  success: boolean;
  latency_ms: number | null;
  created_at: string;
}

export interface AiUsage {
  by_task: Record<string, number>;
  recent: AiRecentCall[];
}

export interface OtpActivityEntry {
  phone: string;
  purpose: string;
  channel: string;
  delivered: boolean;
  verified: boolean;
  ip_address: string | null;
  created_at: string;
}

export interface ConfigPlan {
  id: string;
  label: string;
  price_inr: number;
  duration_months: number;
}

export interface SystemConfig {
  environment: string;
  sms_provider: string;
  ai_provider: string;
  otp_expiry_seconds: number;
  otp_max_send_per_hour: number;
  plans: ConfigPlan[];
}

export interface MutationResult {
  success: boolean;
}

/** A back-office admin account (superadmin management view). */
export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface CreateAdminInput {
  email: string;
  name: string;
  password: string;
  role: AdminRole;
}

export interface UpdateAdminInput {
  name?: string;
  role?: AdminRole;
  is_active?: boolean;
  password?: string;
}

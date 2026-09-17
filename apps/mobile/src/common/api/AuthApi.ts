import { apiRequest } from './ApiClient';

/**
 * TEMPORARY: master switch for OTP phone verification during registration.
 *
 * When false, the Registration flow skips the send-OTP / OTP-verification
 * screen and completes registration locally. Set back to `true` to re-enable
 * mandatory phone verification — no other code needs to change.
 */
export const OTP_VERIFICATION_ENABLED = false;

export interface SendOTPRequest {
  phone: string;
  name: string;
}

export interface SendOTPResponse {
  success: boolean;
  message: string;
}

export interface VerifyOTPRequest {
  phone: string;
  name: string;
  otp: string;
}

export interface VerifyOTPResponse {
  verified: boolean;
  message: string;
  token: string | null;
}

export interface SessionResponse {
  valid: boolean;
  phone: string;
  name: string;
}

/**
 * Request the backend to generate and send an OTP to the given phone number.
 */
export async function sendOTP(phone: string, name: string): Promise<SendOTPResponse> {
  return apiRequest<SendOTPResponse>('/api/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, name } as SendOTPRequest),
  });
}

/**
 * Verify a user-entered OTP against the backend.
 * Returns a session token on success.
 */
export async function verifyOTP(phone: string, name: string, otp: string): Promise<VerifyOTPResponse> {
  return apiRequest<VerifyOTPResponse>('/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, name, otp } as VerifyOTPRequest),
  });
}

/**
 * Validate current session token with the backend.
 */
export async function validateSession(): Promise<SessionResponse> {
  return apiRequest<SessionResponse>('/api/auth/session', {
    method: 'GET',
  }, true);
}

/**
 * Logout — notify backend and discard token.
 */
export async function logout(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', {
      method: 'POST',
    }, true);
  } catch {
    // Logout is best-effort — token is discarded client-side regardless
  }
}

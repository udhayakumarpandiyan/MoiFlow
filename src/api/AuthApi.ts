import { apiRequest } from './ApiClient';

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
  otp: string;
}

export interface VerifyOTPResponse {
  verified: boolean;
  message: string;
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
 */
export async function verifyOTP(phone: string, otp: string): Promise<VerifyOTPResponse> {
  return apiRequest<VerifyOTPResponse>('/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, otp } as VerifyOTPRequest),
  });
}

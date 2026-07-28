/**
 * Admin authentication API calls.
 */

import axios from 'axios'

export interface AdminLoginRequest {
  username: string
  password: string
}

export interface AdminInfo {
  id: number
  username: string
  role: string
}

export interface AdminLoginResponse {
  access_token: string
  token_type: string
  admin: AdminInfo
}

/**
 * Login to admin panel.
 * Uses a raw axios call (not the intercepted client) since the login
 * endpoint itself does not require an existing admin token.
 */
export async function adminLogin(
  credentials: AdminLoginRequest,
): Promise<AdminLoginResponse> {
  const response = await axios.post<AdminLoginResponse>(
    '/api/admin/auth/login',
    credentials,
  )
  return response.data
}

/**
 * Axios instance with Admin JWT interceptor.
 *
 * - Automatically attaches stored admin token to every request
 * - On 401 response, clears token and redirects to /login
 */

import axios from 'axios'
import router from '@/router'

const ADMIN_TOKEN_KEY = 'admin_token'

const apiClient = axios.create({
  baseURL: '/api/admin',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: attach admin JWT
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor: handle 401 by redirecting to login
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(ADMIN_TOKEN_KEY)
      router.push('/login')
    }
    return Promise.reject(error)
  },
)

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY)
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem(ADMIN_TOKEN_KEY)
}

export default apiClient

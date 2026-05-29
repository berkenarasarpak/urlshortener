import { getToken } from './auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }
  
  return response.json()
}

export const authApi = {
  register: (data: any) => fetchWithAuth('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  login: (data: any) => fetchWithAuth('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  getMe: () => fetchWithAuth('/api/auth/me'),
  
  refreshApiKey: () => fetchWithAuth('/api/auth/refresh-api-key', {
    method: 'POST',
  }),
}

export const urlApi = {
  create: (data: any) => fetchWithAuth('/api/urls', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  createPublic: (data: any) => fetchWithAuth('/api/urls/public', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetchWithAuth(`/api/urls${queryString}`)
  },
  
  getAnalytics: (id: string, params?: Record<string, string>) => {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetchWithAuth(`/api/urls/${id}/analytics${queryString}`)
  },
  
  update: (id: string, data: any) => fetchWithAuth(`/api/urls/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  delete: (id: string) => fetchWithAuth(`/api/urls/${id}`, {
    method: 'DELETE',
  }),
}

export const dashboardApi = {
  getStats: () => fetchWithAuth('/api/dashboard/stats'),
}

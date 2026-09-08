import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    if (config.headers) {
      config.headers.set ? config.headers.set('Authorization', `Bearer ${token}`) : (config.headers['Authorization'] = `Bearer ${token}`)
    }
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh') || originalRequest?.url?.includes('/auth/register')

    if (err.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      originalRequest._retry = true
      try {
        const { data } = await api.post('/auth/refresh')
        localStorage.setItem('access_token', data.access_token)
        if (originalRequest.headers) {
          originalRequest.headers.set
            ? originalRequest.headers.set('Authorization', `Bearer ${data.access_token}`)
            : (originalRequest.headers['Authorization'] = `Bearer ${data.access_token}`)
        }
        return api(originalRequest)
      } catch (refreshErr) {
        localStorage.removeItem('access_token')
        return Promise.reject(refreshErr)
      }
    }
    return Promise.reject(err)
  }
)

export const message = (e: unknown): string => {
  if (axios.isAxiosError(e)) {
    return e.response?.data?.error?.message || e.response?.data?.detail || e.message || 'Request failed.'
  }
  if (e instanceof Error) {
    return e.message
  }
  return 'Something went wrong.'
}

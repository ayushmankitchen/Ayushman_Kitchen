import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

export type User = {
  id: number
  name: string
  email: string
  student_id: string
  role: 'STUDENT' | 'ADMIN' | 'KITCHEN_STAFF'
  phone?: string | null
  is_active: boolean
  latitude?: number | null
  longitude?: number | null
  delivery_address?: string | null
}

export type RegisterData = {
  student_id: string
  name: string
  email: string
  password: string
  phone?: string
  plan?: 'STANDARD' | 'PREMIUM'
}

type Auth = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const Context = createContext<Auth>(null!)

export const useAuth = () => useContext(Context)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
    } catch {
      localStorage.removeItem('access_token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      void refreshUser()
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('access_token', data.access_token)
    setUser(data.user)
  }

  const register = async (regData: RegisterData) => {
    const { data } = await api.post('/auth/register', regData)
    localStorage.setItem('access_token', data.access_token)
    setUser(data.user)
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('access_token')
      setUser(null)
    }
  }

  return <Context.Provider value={{ user, loading, login, register, logout, refreshUser }}>{children}</Context.Provider>
}

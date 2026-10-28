import { use } from 'react'
import { AuthContext } from '@/auth/AuthContext'

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth moet binnen <AuthProvider> gebruikt worden')
  return ctx
}

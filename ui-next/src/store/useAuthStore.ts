import { create } from 'zustand'

import { appAuth, type AppSessionStatus, type InviteInfo } from '@/lib/api'
import { isPublicDemoMode } from '@/lib/public-demo'

const PUBLIC_BYPASS_SESSION: AppSessionStatus = {
  authenticated: true,
  role: 'admin',
  invite_id: null,
  label: 'Public editing mode',
  auth_bypass: true,
}

const PUBLIC_DEMO_SESSION: AppSessionStatus = {
  authenticated: true,
  role: 'admin',
  invite_id: null,
  label: 'Public read-only demo',
  auth_bypass: false,
}

const isPublicAuthBypassEnabled = () =>
  String(import.meta.env.VITE_AUTH_BYPASS_ENABLED ?? 'false').toLowerCase() === 'true'

const initialPublicSession = () => isPublicDemoMode()
  ? PUBLIC_DEMO_SESSION
  : isPublicAuthBypassEnabled()
    ? PUBLIC_BYPASS_SESSION
    : null

interface AuthState {
  session: AppSessionStatus | null
  invites: InviteInfo[]
  isLoading: boolean
  error: string | null
  fetchSession: () => Promise<void>
  adminLogin: (secret: string) => Promise<void>
  inviteLogin: (token: string) => Promise<void>
  logout: () => Promise<void>
  fetchInvites: () => Promise<void>
  createInvite: (label?: string) => Promise<string | null>
  revokeInvite: (inviteId: string) => Promise<void>
  revokeAllInvites: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: initialPublicSession(),
  invites: [],
  isLoading: false,
  error: null,

  fetchSession: async () => {
    if (isPublicDemoMode()) {
      set({ session: PUBLIC_DEMO_SESSION, isLoading: false, error: null })
      return
    }
    if (isPublicAuthBypassEnabled()) {
      set({ session: PUBLIC_BYPASS_SESSION, isLoading: false, error: null })
      return
    }
    set({ isLoading: true, error: null })
    try {
      const res = await appAuth.getSession()
      set({ session: res.data })
    } catch (error) {
      console.error('Fetch session error:', error)
      set({ error: 'Failed to load session', session: { authenticated: false } })
    } finally {
      set({ isLoading: false })
    }
  },

  adminLogin: async (secret: string) => {
    if (isPublicAuthBypassEnabled()) {
      set({ session: PUBLIC_BYPASS_SESSION, isLoading: false, error: null })
      return
    }
    set({ isLoading: true, error: null })
    try {
      const res = await appAuth.adminLogin(secret)
      set({ session: res.data })
    } catch (error: any) {
      console.error('Admin login error:', error)
      set({ error: error?.response?.data?.detail || 'Admin login failed' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  inviteLogin: async (token: string) => {
    if (isPublicAuthBypassEnabled()) {
      set({ session: PUBLIC_BYPASS_SESSION, isLoading: false, error: null })
      return
    }
    set({ isLoading: true, error: null })
    try {
      const res = await appAuth.inviteLogin(token)
      set({ session: res.data })
    } catch (error: any) {
      console.error('Invite login error:', error)
      set({ error: error?.response?.data?.detail || 'Invite login failed' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    if (isPublicDemoMode()) {
      set({ session: PUBLIC_DEMO_SESSION, invites: [], isLoading: false, error: null })
      return
    }
    if (isPublicAuthBypassEnabled()) {
      set({ session: PUBLIC_BYPASS_SESSION, invites: [], isLoading: false, error: null })
      return
    }
    set({ isLoading: true, error: null })
    try {
      await appAuth.logout()
      set({ session: { authenticated: false }, invites: [] })
    } catch (error: any) {
      console.error('Logout error:', error)
      set({ error: error?.response?.data?.detail || 'Logout failed' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  fetchInvites: async () => {
    if (isPublicDemoMode()) {
      set({ invites: [], error: null })
      return
    }
    try {
      const res = await appAuth.listInvites()
      set({ invites: res.data })
    } catch (error: any) {
      console.error('Fetch invites error:', error)
      set({ error: error?.response?.data?.detail || 'Failed to load invites' })
    }
  },

  createInvite: async (label?: string) => {
    if (isPublicDemoMode()) {
      set({ error: '公開デモでは招待を作成できません。' })
      return null
    }
    try {
      const res = await appAuth.createInvite(label)
      await get().fetchInvites()
      return res.data?.token ?? null
    } catch (error: any) {
      console.error('Create invite error:', error)
      set({ error: error?.response?.data?.detail || 'Failed to create invite' })
      return null
    }
  },

  revokeInvite: async (inviteId: string) => {
    if (isPublicDemoMode()) return
    try {
      await appAuth.revokeInvite(inviteId)
      await get().fetchInvites()
    } catch (error: any) {
      console.error('Revoke invite error:', error)
      set({ error: error?.response?.data?.detail || 'Failed to revoke invite' })
    }
  },

  revokeAllInvites: async () => {
    if (isPublicDemoMode()) return
    try {
      await appAuth.revokeAllInvites()
      await get().fetchInvites()
    } catch (error: any) {
      console.error('Revoke all invites error:', error)
      set({ error: error?.response?.data?.detail || 'Failed to revoke invites' })
    }
  },
}))

import { afterEach, describe, expect, it, vi } from 'vitest'

const appAuthMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  adminLogin: vi.fn(),
  inviteLogin: vi.fn(),
  logout: vi.fn(),
  listInvites: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  revokeAllInvites: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  appAuth: appAuthMocks,
}))

const loadStore = async () => {
  vi.resetModules()
  return import('@/store/useAuthStore')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.resetModules()
})

describe('useAuthStore public bypass defaults', () => {
  it('starts private when VITE_AUTH_BYPASS_ENABLED is unset', async () => {
    vi.unstubAllEnvs()

    const { useAuthStore } = await loadStore()

    expect(useAuthStore.getState().session).toBeNull()
  })

  it('starts private when VITE_AUTH_BYPASS_ENABLED is false', async () => {
    vi.stubEnv('VITE_AUTH_BYPASS_ENABLED', 'false')

    const { useAuthStore } = await loadStore()

    expect(useAuthStore.getState().session).toBeNull()
  })

  it('enables public mode only when VITE_AUTH_BYPASS_ENABLED is true', async () => {
    vi.stubEnv('VITE_AUTH_BYPASS_ENABLED', 'true')

    const { useAuthStore } = await loadStore()

    expect(useAuthStore.getState().session).toMatchObject({
      authenticated: true,
      role: 'admin',
      auth_bypass: true,
    })
  })

  it('skips API session fetch in public mode', async () => {
    vi.stubEnv('VITE_AUTH_BYPASS_ENABLED', 'true')

    const { useAuthStore } = await loadStore()

    await useAuthStore.getState().fetchSession()

    expect(appAuthMocks.getSession).not.toHaveBeenCalled()
    expect(useAuthStore.getState().session).toMatchObject({
      authenticated: true,
      auth_bypass: true,
    })
  })
})
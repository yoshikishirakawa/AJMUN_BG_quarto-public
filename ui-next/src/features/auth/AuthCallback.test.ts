import { describe, expect, it } from 'vitest'
import { parseOAuthCallbackSearch } from './authCallbackUtils'

describe('parseOAuthCallbackSearch', () => {
  it('returns Google OAuth code and state from callback query', () => {
    expect(parseOAuthCallbackSearch('?code=code-123&state=state-123')).toEqual({
      code: 'code-123',
      state: 'state-123',
      error: null,
    })
  })

  it('preserves callback error and missing code state', () => {
    expect(parseOAuthCallbackSearch('?error=access_denied')).toEqual({
      code: null,
      state: null,
      error: 'access_denied',
    })
  })
})

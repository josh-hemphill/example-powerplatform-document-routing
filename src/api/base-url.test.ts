import { describe, expect, it } from 'vitest'
import { getApiBaseUrl } from '@/api/base-url'

describe('getApiBaseUrl', () => {
  it('defaults to the local mock mount path', () => {
    expect(getApiBaseUrl()).toBe('/api')
  })
})

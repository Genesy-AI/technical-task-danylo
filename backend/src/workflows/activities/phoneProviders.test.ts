import { describe, it, expect, vi, afterEach } from 'vitest'
import { lookupViaOrionConnect, lookupViaAstraDialer, lookupViaNimbusLookup } from './phoneProviders'

const input = { fullName: 'Ada Lovelace', email: 'ada@example.com', companyWebsite: 'example.com', jobTitle: 'CTO' }

const mockFetch = (body: unknown, ok = true) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lookupViaOrionConnect', () => {
  it('sends fullName/companyWebsite and the x-auth-me header, and returns the phone', async () => {
    mockFetch({ phone: '+15550100' })
    const result = await lookupViaOrionConnect(input)

    expect(result).toBe('+15550100')
    const [url, options] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://api.enginy.ai/api/tmp/orionConnect')
    expect(options.headers['x-auth-me']).toBe('mySecretKey123')
    expect(JSON.parse(options.body)).toEqual({ fullName: 'Ada Lovelace', companyWebsite: 'example.com' })
  })

  it('returns null when no phone is found', async () => {
    mockFetch({ phone: null })
    expect(await lookupViaOrionConnect(input)).toBeNull()
  })

  it('throws when the request fails', async () => {
    mockFetch({}, false)
    await expect(lookupViaOrionConnect(input)).rejects.toThrow('Orion Connect request failed')
  })
})

describe('lookupViaAstraDialer', () => {
  it('sends email and the apiKey header, and returns the phone', async () => {
    mockFetch({ phoneNmbr: '+15550101' })
    const result = await lookupViaAstraDialer(input)

    expect(result).toBe('+15550101')
    const [url, options] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://api.enginy.ai/api/tmp/astraDialer')
    expect(options.headers.apiKey).toBe('1234jhgf')
    expect(JSON.parse(options.body)).toEqual({ email: 'ada@example.com' })
  })

  it('treats an undefined phoneNmbr as not found', async () => {
    mockFetch({ phoneNmbr: undefined })
    expect(await lookupViaAstraDialer(input)).toBeNull()
  })
})

describe('lookupViaNimbusLookup', () => {
  it('sends email/jobTitle, the api query param, and stringifies the numeric response', async () => {
    mockFetch({ number: 15550102, countryCode: 'US' })
    const result = await lookupViaNimbusLookup(input)

    expect(result).toBe('15550102')
    const [url, options] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://api.enginy.ai/api/tmp/numbusLookup?api=000099998888')
    expect(JSON.parse(options.body)).toEqual({ email: 'ada@example.com', jobTitle: 'CTO' })
  })

  it('returns null when number is missing', async () => {
    mockFetch({ number: null, countryCode: 'US' })
    expect(await lookupViaNimbusLookup(input)).toBeNull()
  })
})

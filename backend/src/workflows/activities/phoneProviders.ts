// Common shape all three phone-lookup providers are adapted to, so the workflow can call any
// of them the same way despite each having a different request/auth/response format.
export interface PhoneProviderInput {
  fullName: string
  email: string
  companyWebsite?: string
  jobTitle?: string
}

export type PhoneProviderLookup = (input: PhoneProviderInput) => Promise<string | null>

export const lookupViaOrionConnect: PhoneProviderLookup = async (input) => {
  const response = await fetch('https://api.enginy.ai/api/tmp/orionConnect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-me': 'mySecretKey123',
    },
    body: JSON.stringify({
      fullName: input.fullName,
      companyWebsite: input.companyWebsite ?? '',
    }),
  })

  if (!response.ok) {
    throw new Error(`Orion Connect request failed with status ${response.status}`)
  }

  const data = (await response.json()) as { phone: string | null }
  return data.phone ?? null
}

export const lookupViaAstraDialer: PhoneProviderLookup = async (input) => {
  const response = await fetch('https://api.enginy.ai/api/tmp/astraDialer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apiKey: '1234jhgf',
    },
    body: JSON.stringify({ email: input.email }),
  })

  if (!response.ok) {
    throw new Error(`Astra Dialer request failed with status ${response.status}`)
  }

  const data = (await response.json()) as { phoneNmbr: string | null | undefined }
  return data.phoneNmbr ?? null
}

export const lookupViaNimbusLookup: PhoneProviderLookup = async (input) => {
  const url = new URL('https://api.enginy.ai/api/tmp/numbusLookup')
  url.searchParams.set('api', '000099998888')

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: input.email, jobTitle: input.jobTitle ?? '' }),
  })

  if (!response.ok) {
    throw new Error(`Nimbus Lookup request failed with status ${response.status}`)
  }

  const data = (await response.json()) as { number: number | null | undefined; countryCode: string }
  return data.number !== null && data.number !== undefined ? String(data.number) : null
}

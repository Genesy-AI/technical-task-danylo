import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

// Timeout covers the slowest simulated provider path (~20s); retries are bounded so a
// genuinely failing call reports back instead of retrying forever (Temporal's default
// retry policy has no maximum attempts).
const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 3,
  },
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}

// Short timeout + bounded retries per provider: a consistently slow/failing provider (Orion
// Connect is documented as "slow and fails sometimes") gives up and falls through to the next
// provider instead of retrying forever, unlike the original email-verification bug.
const { lookupViaOrionConnect, lookupViaAstraDialer, lookupViaNimbusLookup, recordPhoneEnrichmentResult } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '5 seconds',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 2,
      initialInterval: '500ms',
    },
  })

export interface EnrichPhoneInput {
  leadId: number
  fullName: string
  email: string
  companyWebsite?: string
  jobTitle?: string
}

export interface EnrichPhoneResult {
  phone: string | null
  status: 'FOUND' | 'NOT_FOUND'
}

export async function enrichPhoneWorkflow(input: EnrichPhoneInput): Promise<EnrichPhoneResult> {
  const providers = [lookupViaOrionConnect, lookupViaAstraDialer, lookupViaNimbusLookup]

  for (const lookup of providers) {
    try {
      const phone = await lookup(input)
      if (phone) {
        await recordPhoneEnrichmentResult(input.leadId, phone, 'FOUND')
        return { phone, status: 'FOUND' }
      }
    } catch {
      // This provider exhausted its retries; fall through to the next one.
    }
  }

  await recordPhoneEnrichmentResult(input.leadId, null, 'NOT_FOUND')
  return { phone: null, status: 'NOT_FOUND' }
}

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export type PhoneEnrichmentStatus = 'PENDING' | 'FOUND' | 'NOT_FOUND'

// Called from within the workflow once the provider cascade finishes (or never, if the caller
// never started one). Only overwrites phoneNumber when a phone was actually found, so a
// "not found" result doesn't erase a phone number that was set some other way (e.g. CSV import).
export async function recordPhoneEnrichmentResult(
  leadId: number,
  phone: string | null,
  status: PhoneEnrichmentStatus
): Promise<void> {
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      ...(phone ? { phoneNumber: phone } : {}),
      phoneEnrichmentStatus: status,
    },
  })
}

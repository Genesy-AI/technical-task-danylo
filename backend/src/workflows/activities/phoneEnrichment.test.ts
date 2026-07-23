import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { recordPhoneEnrichmentResult } from './phoneEnrichment'

const prisma = new PrismaClient()
const testEmails: string[] = []

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { email: { in: testEmails } } })
  await prisma.$disconnect()
})

describe('recordPhoneEnrichmentResult', () => {
  it('sets phoneNumber and status to FOUND when a phone was found', async () => {
    const email = `phone-enrichment-found-${Date.now()}@example.com`
    testEmails.push(email)
    const lead = await prisma.lead.create({ data: { firstName: 'Ada', lastName: 'Lovelace', email } })

    await recordPhoneEnrichmentResult(lead.id, '+15550100', 'FOUND')

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })
    expect(updated.phoneNumber).toBe('+15550100')
    expect(updated.phoneEnrichmentStatus).toBe('FOUND')
  })

  it('sets status to NOT_FOUND without touching an existing phoneNumber', async () => {
    const email = `phone-enrichment-not-found-${Date.now()}@example.com`
    testEmails.push(email)
    const lead = await prisma.lead.create({
      data: { firstName: 'Grace', lastName: 'Hopper', email, phoneNumber: '+15550199' },
    })

    await recordPhoneEnrichmentResult(lead.id, null, 'NOT_FOUND')

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })
    expect(updated.phoneNumber).toBe('+15550199')
    expect(updated.phoneEnrichmentStatus).toBe('NOT_FOUND')
  })
})

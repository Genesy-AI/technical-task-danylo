import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { app } from './app'

// Runs against the real dev SQLite database (no test-DB setup exists in this repo yet) - every
// lead created here is tagged with a unique email and removed in afterAll.
const prisma = new PrismaClient()
const testEmails: string[] = []

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { email: { in: testEmails } } })
  await prisma.$disconnect()
})

describe('POST /leads/bulk - new lead fields', () => {
  it('persists phoneNumber, yearsInRole, and linkedinUrl', async () => {
    const email = `app-test-valid-${Date.now()}@example.com`
    testEmails.push(email)

    const response = await request(app)
      .post('/leads/bulk')
      .send({
        leads: [
          {
            firstName: 'Grace',
            lastName: 'Hopper',
            email,
            phoneNumber: '+12025550100',
            yearsInRole: 12,
            linkedinUrl: 'https://linkedin.com/in/grace-hopper',
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(response.body.importedCount).toBe(1)

    const created = await prisma.lead.findFirst({ where: { email } })
    expect(created?.phoneNumber).toBe('+12025550100')
    expect(created?.yearsInRole).toBe(12)
    expect(created?.linkedinUrl).toBe('https://linkedin.com/in/grace-hopper')
  })

  it('falls back to null for a non-numeric yearsInRole instead of failing the import', async () => {
    const email = `app-test-bad-years-${Date.now()}@example.com`
    testEmails.push(email)

    const response = await request(app)
      .post('/leads/bulk')
      .send({
        leads: [{ firstName: 'Bad', lastName: 'Years', email, yearsInRole: 'not-a-number' }],
      })

    expect(response.status).toBe(200)
    expect(response.body.importedCount).toBe(1)

    const created = await prisma.lead.findFirst({ where: { email } })
    expect(created?.yearsInRole).toBeNull()
  })

  it('leaves the new fields null when omitted', async () => {
    const email = `app-test-omitted-${Date.now()}@example.com`
    testEmails.push(email)

    const response = await request(app)
      .post('/leads/bulk')
      .send({ leads: [{ firstName: 'No', lastName: 'Extras', email }] })

    expect(response.status).toBe(200)
    expect(response.body.importedCount).toBe(1)

    const created = await prisma.lead.findFirst({ where: { email } })
    expect(created?.phoneNumber).toBeNull()
    expect(created?.yearsInRole).toBeNull()
    expect(created?.linkedinUrl).toBeNull()
  })
})

// Requires the real Temporal dev server running at localhost:7233 and reaches the real
// api.enginy.ai provider endpoints, same trade-off as the rest of this file's DB dependency.
describe('POST /leads/enrich-phone', () => {
  it('rejects a request with no leadIds', async () => {
    const response = await request(app).post('/leads/enrich-phone').send({})
    expect(response.status).toBe(400)
  })

  it('returns 404 when none of the given lead ids exist', async () => {
    const response = await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [999999999] })
    expect(response.status).toBe(404)
  })

  it(
    'starts the workflow, marks the lead PENDING, and only allows one run at a time per lead',
    async () => {
      const email = `app-test-enrich-${Date.now()}@example.com`
      testEmails.push(email)
      const lead = await prisma.lead.create({ data: { firstName: 'Ada', lastName: 'Lovelace', email } })

      const [first, second] = await Promise.all([
        request(app).post('/leads/enrich-phone').send({ leadIds: [lead.id] }),
        request(app).post('/leads/enrich-phone').send({ leadIds: [lead.id] }),
      ])

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)

      // Exactly one of the two concurrent requests should have actually started the workflow;
      // the other must see it as already in progress - this is the "only one per lead" guarantee.
      const startedCount = [first, second].filter((r) => r.body.started.includes(lead.id)).length
      const alreadyInProgressCount = [first, second].filter((r) =>
        r.body.alreadyInProgress.includes(lead.id)
      ).length
      expect(startedCount).toBe(1)
      expect(alreadyInProgressCount).toBe(1)

      const afterStart = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })
      expect(['PENDING', 'FOUND', 'NOT_FOUND']).toContain(afterStart.phoneEnrichmentStatus)
    },
    30000
  )
})

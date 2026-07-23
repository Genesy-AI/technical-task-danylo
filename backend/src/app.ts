import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { Connection, Client, WorkflowExecutionAlreadyStartedError } from '@temporalio/client'
import { verifyEmailWorkflow, enrichPhoneWorkflow } from './workflows'
import { generateMessageFromTemplate } from './utils/messageGenerator'

const prisma = new PrismaClient()

// Express app only (routes + middleware) - no listen()/Temporal worker bootstrap here, so
// this module can be imported directly in tests (see app.test.ts) without side effects.
export const app = express()
app.use(express.json())

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
    return
  }

  next()
})

app.post('/leads', async (req: Request, res: Response) => {
  const { name, lastName, email } = req.body

  if (!name || !lastName || !email) {
    return res.status(400).json({ error: 'firstName, lastName, and email are required' })
  }

  const lead = await prisma.lead.create({
    data: {
      firstName: String(name),
      lastName: String(lastName),
      email: String(email),
    },
  })
  res.json(lead)
})

app.get('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const lead = await prisma.lead.findUnique({
    where: {
      id: Number(id),
    },
  })
  res.json(lead)
})

app.get('/leads', async (req: Request, res: Response) => {
  const leads = await prisma.lead.findMany()

  res.json(leads)
})

app.patch('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, email } = req.body
  const lead = await prisma.lead.update({
    where: {
      id: Number(id),
    },
    data: {
      firstName: String(name),
      email: String(email),
    },
  })
  res.json(lead)
})

app.delete('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  await prisma.lead.delete({
    where: {
      id: Number(id),
    },
  })
  res.json()
})

app.delete('/leads', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { ids } = req.body

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }

  try {
    const result = await prisma.lead.deleteMany({
      where: {
        id: {
          in: ids.map((id) => Number(id)),
        },
      },
    })

    res.json({ deletedCount: result.count })
  } catch (error) {
    console.error('Error deleting leads:', error)
    res.status(500).json({ error: 'Failed to delete leads' })
  }
})

app.post('/leads/generate-messages', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds, template } = req.body

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  if (!template || typeof template !== 'string') {
    return res.status(400).json({ error: 'template must be a non-empty string' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: {
        id: {
          in: leadIds.map((id) => Number(id)),
        },
      },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    let generatedCount = 0
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    for (const lead of leads) {
      try {
        const message = generateMessageFromTemplate(template, lead)

        await prisma.lead.update({
          where: { id: lead.id },
          data: { message },
        })

        generatedCount++
      } catch (error) {
        errors.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      generatedCount,
      errors,
    })
  } catch (error) {
    console.error('Error generating messages:', error)
    res.status(500).json({ error: 'Failed to generate messages' })
  }
})

app.post('/leads/bulk', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leads } = req.body

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'leads must be a non-empty array' })
  }

  try {
    const validLeads = leads.filter((lead) => {
      return (
        lead.firstName &&
        lead.lastName &&
        lead.email &&
        typeof lead.firstName === 'string' &&
        lead.firstName.trim() &&
        typeof lead.lastName === 'string' &&
        lead.lastName.trim() &&
        typeof lead.email === 'string' &&
        lead.email.trim()
      )
    })

    if (validLeads.length === 0) {
      return res
        .status(400)
        .json({ error: 'No valid leads found. firstName, lastName, and email are required.' })
    }

    const existingLeads = await prisma.lead.findMany({
      where: {
        OR: validLeads.map((lead) => ({
          AND: [{ firstName: lead.firstName.trim() }, { lastName: lead.lastName.trim() }],
        })),
      },
    })

    const leadKeys = new Set(
      existingLeads.map((lead) => `${lead.firstName.toLowerCase()}_${(lead.lastName || '').toLowerCase()}`)
    )

    const uniqueLeads = validLeads.filter((lead) => {
      const key = `${lead.firstName.toLowerCase()}_${lead.lastName.toLowerCase()}`
      return !leadKeys.has(key)
    })

    let importedCount = 0
    const errors: Array<{ lead: any; error: string }> = []

    for (const lead of uniqueLeads) {
      try {
        // yearsInRole must be a real number to satisfy the Int? column; anything else is
        // dropped to null rather than rejecting the whole lead.
        const yearsInRole = Number(lead.yearsInRole)

        await prisma.lead.create({
          data: {
            firstName: lead.firstName.trim(),
            lastName: lead.lastName.trim(),
            email: lead.email.trim(),
            jobTitle: lead.jobTitle ? lead.jobTitle.trim() : null,
            countryCode: lead.countryCode ? lead.countryCode.trim() : null,
            companyName: lead.companyName ? lead.companyName.trim() : null,
            phoneNumber: lead.phoneNumber ? String(lead.phoneNumber).trim() : null,
            yearsInRole: Number.isFinite(yearsInRole) ? yearsInRole : null,
            linkedinUrl: lead.linkedinUrl ? String(lead.linkedinUrl).trim() : null,
          },
        })
        importedCount++
      } catch (error) {
        errors.push({
          lead: lead,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      importedCount,
      duplicatesSkipped: validLeads.length - uniqueLeads.length,
      invalidLeads: leads.length - validLeads.length,
      errors,
    })
  } catch (error) {
    console.error('Error importing leads:', error)
    res.status(500).json({ error: 'Failed to import leads' })
  }
})

app.post('/leads/verify-emails', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds } = req.body as { leadIds?: number[] }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds.map((id) => Number(id)) } },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    const connection = await Connection.connect({ address: 'localhost:7233' })
    const client = new Client({ connection, namespace: 'default' })

    let verifiedCount = 0
    const results: Array<{ leadId: number; emailVerified: boolean }> = []
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    for (const lead of leads) {
      try {
        const isVerified = await client.workflow.execute(verifyEmailWorkflow, {
          taskQueue: 'myQueue',
          workflowId: `verify-email-${lead.id}-${Date.now()}`,
          args: [lead.email],
        })

        await prisma.lead.update({
          where: { id: lead.id },
          data: { emailVerified: Boolean(isVerified) },
        })

        results.push({ leadId: lead.id, emailVerified: isVerified })
        verifiedCount += 1
      } catch (error) {
        errors.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    await connection.close()

    res.json({ success: true, verifiedCount, results, errors })
  } catch (error) {
    console.error('Error verifying emails:', error)
    res.status(500).json({ error: 'Failed to verify emails' })
  }
})

app.post('/leads/enrich-phone', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds } = req.body as { leadIds?: number[] }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds.map((id) => Number(id)) } },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    const connection = await Connection.connect({ address: 'localhost:7233' })
    const client = new Client({ connection, namespace: 'default' })

    const started: number[] = []
    const alreadyInProgress: number[] = []
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    for (const lead of leads) {
      try {
        // Stable, per-lead workflow ID: Temporal itself rejects a second start while one is
        // already running, giving "only one enrichment per lead" without any extra locking.
        await client.workflow.start(enrichPhoneWorkflow, {
          taskQueue: 'myQueue',
          workflowId: `enrich-phone-lead-${lead.id}`,
          args: [
            {
              leadId: lead.id,
              fullName: `${lead.firstName} ${lead.lastName}`.trim(),
              email: lead.email,
              companyWebsite: lead.companyName ?? undefined,
              jobTitle: lead.jobTitle ?? undefined,
            },
          ],
        })

        // Only mark PENDING once the workflow is confirmed scheduled, so a failed start never
        // leaves a lead stuck showing "in progress" with nothing actually running for it.
        await prisma.lead.update({
          where: { id: lead.id },
          data: { phoneEnrichmentStatus: 'PENDING' },
        })

        started.push(lead.id)
      } catch (error) {
        if (error instanceof WorkflowExecutionAlreadyStartedError) {
          alreadyInProgress.push(lead.id)
        } else {
          errors.push({
            leadId: lead.id,
            leadName: `${lead.firstName} ${lead.lastName}`.trim(),
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    }

    await connection.close()

    res.json({ success: true, started, alreadyInProgress, errors })
  } catch (error) {
    console.error('Error starting phone enrichment:', error)
    res.status(500).json({ error: 'Failed to start phone enrichment' })
  }
})

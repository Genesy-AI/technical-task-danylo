import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'crypto'
import path from 'path'
import { Worker, NativeConnection } from '@temporalio/worker'
import { Connection, Client } from '@temporalio/client'
import { enrichPhoneWorkflow } from './workflows'

// Exercises the real enrichPhoneWorkflow sequencing logic (stop early / cascade / NOT_FOUND)
// against the real Temporal dev server, but on an isolated task queue with mock provider
// activities so the outcome is deterministic instead of depending on the real provider APIs.
const taskQueue = `enrich-phone-workflow-test-${randomUUID()}`

const mockOrion = vi.fn<() => Promise<string | null>>()
const mockAstra = vi.fn<() => Promise<string | null>>()
const mockNimbus = vi.fn<() => Promise<string | null>>()
const mockRecordResult = vi.fn<(leadId: number, phone: string | null, status: string) => Promise<void>>()

let nativeConnection: NativeConnection
let worker: Worker
let workerRunPromise: Promise<void>
let connection: Connection
let client: Client

beforeAll(async () => {
  nativeConnection = await NativeConnection.connect({ address: 'localhost:7233' })
  worker = await Worker.create({
    connection: nativeConnection,
    namespace: 'default',
    taskQueue,
    workflowsPath: path.join(__dirname, 'workflows.ts'),
    activities: {
      lookupViaOrionConnect: mockOrion,
      lookupViaAstraDialer: mockAstra,
      lookupViaNimbusLookup: mockNimbus,
      recordPhoneEnrichmentResult: mockRecordResult,
    },
  })
  workerRunPromise = worker.run()

  connection = await Connection.connect({ address: 'localhost:7233' })
  client = new Client({ connection, namespace: 'default' })
}, 30000)

afterAll(async () => {
  worker.shutdown()
  await workerRunPromise
  await connection.close()
  await nativeConnection.close()
}, 30000)

beforeEach(() => {
  mockOrion.mockReset()
  mockAstra.mockReset()
  mockNimbus.mockReset()
  mockRecordResult.mockReset().mockResolvedValue(undefined)
})

const runWorkflow = async (leadId: number) =>
  client.workflow.execute(enrichPhoneWorkflow, {
    taskQueue,
    workflowId: `enrich-phone-workflow-test-${randomUUID()}`,
    args: [{ leadId, fullName: 'Ada Lovelace', email: 'ada@example.com' }],
  })

describe('enrichPhoneWorkflow', () => {
  it(
    'stops after Orion Connect and never calls Astra Dialer or Nimbus Lookup',
    async () => {
      mockOrion.mockResolvedValue('+15550100')

      const result = await runWorkflow(1)

      expect(result).toEqual({ phone: '+15550100', status: 'FOUND' })
      expect(mockOrion).toHaveBeenCalledTimes(1)
      expect(mockAstra).not.toHaveBeenCalled()
      expect(mockNimbus).not.toHaveBeenCalled()
      expect(mockRecordResult).toHaveBeenCalledWith(1, '+15550100', 'FOUND')
    },
    30000
  )

  it(
    'falls through to Astra Dialer when Orion Connect finds nothing, and never calls Nimbus Lookup',
    async () => {
      mockOrion.mockResolvedValue(null)
      mockAstra.mockResolvedValue('+15550101')

      const result = await runWorkflow(2)

      expect(result).toEqual({ phone: '+15550101', status: 'FOUND' })
      expect(mockOrion).toHaveBeenCalledTimes(1)
      expect(mockAstra).toHaveBeenCalledTimes(1)
      expect(mockNimbus).not.toHaveBeenCalled()
      expect(mockRecordResult).toHaveBeenCalledWith(2, '+15550101', 'FOUND')
    },
    30000
  )

  it(
    'falls through to Nimbus Lookup when the first two providers find nothing',
    async () => {
      mockOrion.mockResolvedValue(null)
      mockAstra.mockResolvedValue(null)
      mockNimbus.mockResolvedValue('+15550102')

      const result = await runWorkflow(3)

      expect(result).toEqual({ phone: '+15550102', status: 'FOUND' })
      expect(mockOrion).toHaveBeenCalledTimes(1)
      expect(mockAstra).toHaveBeenCalledTimes(1)
      expect(mockNimbus).toHaveBeenCalledTimes(1)
      expect(mockRecordResult).toHaveBeenCalledWith(3, '+15550102', 'FOUND')
    },
    30000
  )

  it(
    'marks NOT_FOUND when all three providers find nothing',
    async () => {
      mockOrion.mockResolvedValue(null)
      mockAstra.mockResolvedValue(null)
      mockNimbus.mockResolvedValue(null)

      const result = await runWorkflow(4)

      expect(result).toEqual({ phone: null, status: 'NOT_FOUND' })
      expect(mockRecordResult).toHaveBeenCalledWith(4, null, 'NOT_FOUND')
    },
    30000
  )

  it(
    'falls through to the next provider when one keeps failing instead of hanging',
    async () => {
      mockOrion.mockRejectedValue(new Error('Orion Connect is down'))
      mockAstra.mockResolvedValue('+15550103')

      const result = await runWorkflow(5)

      expect(result).toEqual({ phone: '+15550103', status: 'FOUND' })
      expect(mockNimbus).not.toHaveBeenCalled()
    },
    30000
  )
})

export type LeadsEnrichPhoneInput = {
  leadIds: number[]
}

export type LeadsEnrichPhoneOutput = {
  success: boolean
  started: number[]
  alreadyInProgress: number[]
  errors: Array<{
    leadId: number
    leadName: string
    error: string
  }>
}

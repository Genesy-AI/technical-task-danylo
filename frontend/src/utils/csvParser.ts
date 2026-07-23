import Papa from 'papaparse'
import { isValidCountryCode } from './isoCountryCodes'

export interface CsvLead {
  firstName: string
  lastName: string
  email: string
  jobTitle?: string
  countryCode?: string
  companyName?: string
  phoneNumber?: string
  yearsInRole?: number
  linkedinUrl?: string
  isValid: boolean
  errors: string[]
  rowIndex: number
}

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const isValidLinkedinUrl = (url: string): boolean => {
  const linkedinUrlRegex = /^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/.+$/i
  return linkedinUrlRegex.test(url.trim())
}

// Normalizes any phone-shaped string into a "+"-prefixed number: drops an extension suffix
// (x2154/ext2154/extension 2154) entirely, strips all formatting punctuation (dots, dashes,
// parentheses, spaces), drops a single leading 00, then prefixes "+". Returns null only if too
// few/many digits remain to plausibly be a phone number.
export const normalizePhoneNumber = (value: string): string | null => {
  const withoutExtension = value.trim().replace(/\s*(?:x|ext\.?|extension)\s*\d+\s*$/i, '')

  let digits = withoutExtension.replace(/\D/g, '')

  if (digits.startsWith('00')) {
    digits = digits.slice(1)
  }

  if (digits.length < 7 || digits.length > 15) {
    return null
  }

  return `+${digits}`
}

export const parseCsv = (content: string): CsvLead[] => {
  if (!content?.trim()) {
    throw new Error('CSV content cannot be empty')
  }

  const parseResult = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim().toLowerCase(),
    quoteChar: '"',
  })

  if (parseResult.errors.length > 0) {
    const criticalErrors = parseResult.errors.filter(
      (error) => error.type === 'Delimiter' || error.type === 'Quotes' || error.type === 'FieldMismatch'
    )
    if (criticalErrors.length > 0) {
      throw new Error(`CSV parsing failed: ${criticalErrors[0].message}`)
    }
  }

  if (!parseResult.data || parseResult.data.length === 0) {
    throw new Error('CSV file appears to be empty or contains no valid data')
  }

  const data: CsvLead[] = []

  parseResult.data.forEach((row, index) => {
    if (Object.values(row).every((value) => !value)) return

    const lead: Partial<CsvLead> = { rowIndex: index + 2 }

    Object.entries(row).forEach(([header, value]) => {
      const normalizedHeader = header.toLowerCase().replace(/[^a-z]/g, '')
      const trimmedValue = value?.trim() || ''

      switch (normalizedHeader) {
        case 'firstname':
          lead.firstName = trimmedValue
          break
        case 'lastname':
          lead.lastName = trimmedValue
          break
        case 'email':
          lead.email = trimmedValue
          break
        case 'jobtitle':
          lead.jobTitle = trimmedValue || undefined
          break
        case 'countrycode':
          lead.countryCode = trimmedValue || undefined
          break
        case 'companyname':
          lead.companyName = trimmedValue || undefined
          break
        case 'phonenumber':
          lead.phoneNumber = trimmedValue || undefined
          break
        case 'yearsinrole':
          lead.yearsInRole = trimmedValue ? Number(trimmedValue) : undefined
          break
        case 'linkedinurl':
          lead.linkedinUrl = trimmedValue || undefined
          break
      }
    })

    const errors: string[] = []
    if (!lead.firstName?.trim()) {
      errors.push('First name is required')
    }
    if (!lead.lastName?.trim()) {
      errors.push('Last name is required')
    }
    if (!lead.email?.trim()) {
      errors.push('Email is required')
    } else if (!isValidEmail(lead.email)) {
      errors.push('Invalid email format')
    }
    if (lead.countryCode && !isValidCountryCode(lead.countryCode)) {
      errors.push('Invalid country code')
    }
    if (lead.yearsInRole !== undefined && (!Number.isFinite(lead.yearsInRole) || lead.yearsInRole < 0)) {
      errors.push('Years at company must be a number')
    }
    if (lead.linkedinUrl && !isValidLinkedinUrl(lead.linkedinUrl)) {
      errors.push('Invalid LinkedIn URL')
    }
    if (lead.phoneNumber) {
      const normalizedPhone = normalizePhoneNumber(lead.phoneNumber)
      if (!normalizedPhone) {
        errors.push('Invalid phone number')
      } else {
        lead.phoneNumber = normalizedPhone
      }
    }

    data.push({
      ...lead,
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      isValid: errors.length === 0,
      errors,
    } as CsvLead)
  })

  return data
}

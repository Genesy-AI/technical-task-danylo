import { describe, it, expect } from 'vitest'
import { parseCsv, isValidEmail, normalizePhoneNumber } from './csvParser'

describe('isValidEmail', () => {
  it('should return true for valid email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
    expect(isValidEmail('first.last+tag@example.org')).toBe(true)
    expect(isValidEmail('123@456.com')).toBe(true)
  })

  it('should return false for invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('test.example.com')).toBe(false)
    expect(isValidEmail('test@.com')).toBe(false)
    expect(isValidEmail('test@example')).toBe(false)
  })
})

describe('parseCsv', () => {
  it('should throw error for empty content', () => {
    expect(() => parseCsv('')).toThrow('CSV content cannot be empty')
    expect(() => parseCsv('   ')).toThrow('CSV content cannot be empty')
  })

  it('should throw error for CSV with only headers', () => {
    const csv = 'firstName,lastName,email'
    expect(() => parseCsv(csv)).toThrow('CSV file appears to be empty or contains no valid data')
  })

  it('should throw error for malformed CSV content', () => {
    const malformedCsv = `firstName,lastName,email
"John,Doe,john@example.com,extra"field`
    expect(() => parseCsv(malformedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with mismatched field count', () => {
    const mismatchedCsv = `firstName,lastName,email
John,Doe,john@example.com,ExtraField,AnotherExtra
Jane,Smith`
    expect(() => parseCsv(mismatchedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with critical delimiter issues', () => {
    const noDelimiterCsv = `firstName lastName email
John Doe john@example.com`
    expect(() => parseCsv(noDelimiterCsv)).toThrow()
  })

  it('should parse valid CSV with all required fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode,companyName
John,Doe,john.doe@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      jobTitle: 'Developer',
      countryCode: 'US',
      companyName: 'Tech Corp',
      isValid: true,
      errors: [],
      rowIndex: 2,
    })
  })

  it('should handle missing required fields and mark as invalid', () => {
    const csv = `firstName,lastName,email
,Smith,john@example.com
John,,john@example.com
John,Smith,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('First name is required')

    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('Last name is required')

    expect(result[2].isValid).toBe(false)
    expect(result[2].errors).toContain('Email is required')
  })

  it('should validate email format', () => {
    const csv = `firstName,lastName,email
John,Doe,invalid-email
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Invalid email format')
    expect(result[1].isValid).toBe(true)
  })

  it('should handle CSV with quoted values', () => {
    const csv = `firstName,lastName,email,jobTitle
"John","Doe","john.doe@example.com","Software Engineer"`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john.doe@example.com')
    expect(result[0].jobTitle).toBe('Software Engineer')
  })

  it('should skip empty rows', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,,
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].firstName).toBe('John')
    expect(result[1].firstName).toBe('Jane')
  })

  it('should handle case-insensitive headers', () => {
    const csv = `FIRSTNAME,LASTNAME,EMAIL,JOBTITLE,COUNTRYCODE,COMPANYNAME
John,Doe,john@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].jobTitle).toBe('Developer')
  })

  it('should handle missing optional fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode
John,Doe,john@example.com,,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].jobTitle).toBeUndefined()
    expect(result[0].countryCode).toBeUndefined()
    expect(result[0].isValid).toBe(true)
  })

  it('should preserve row index correctly', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
Jane,Smith,jane@example.com
Bob,Johnson,bob@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].rowIndex).toBe(2)
    expect(result[1].rowIndex).toBe(3)
    expect(result[2].rowIndex).toBe(4)
  })

  it('should handle multiple validation errors per lead', () => {
    const csv = `firstName,lastName,email
 , ,invalid-email`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toHaveLength(3)
    expect(result[0].errors).toContain('First name is required')
    expect(result[0].errors).toContain('Last name is required')
    expect(result[0].errors).toContain('Invalid email format')
  })

  it('should handle extra columns not in header mapping', () => {
    const csv = `firstName,lastName,email,unknownColumn
John,Doe,john@example.com,someValue`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })

  it('should handle mixed valid and invalid leads', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,Smith,invalid-email
Jane,Johnson,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].isValid).toBe(true)
    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('First name is required')
    expect(result[1].errors).toContain('Invalid email format')
    expect(result[2].isValid).toBe(true)
  })

  it('should accept a valid ISO 3166-1 alpha-2 country code', () => {
    const csv = `firstName,lastName,email,countryCode
John,Doe,john@example.com,US`

    const result = parseCsv(csv)

    expect(result[0].countryCode).toBe('US')
    expect(result[0].isValid).toBe(true)
    expect(result[0].errors).not.toContain('Invalid country code')
  })

  it('should reject a numeric country code', () => {
    const csv = `firstName,lastName,email,countryCode
John,Doe,john@example.com,12`

    const result = parseCsv(csv)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Invalid country code')
  })

  it('should reject a country code that is not a real ISO code', () => {
    const csv = `firstName,lastName,email,countryCode
John,Doe,john@example.com,XXX`

    const result = parseCsv(csv)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Invalid country code')
  })

  it('should parse phoneNumber, yearsInRole, and linkedinUrl when valid', () => {
    const csv = `firstName,lastName,email,phoneNumber,yearsInRole,linkedinUrl
John,Doe,john@example.com,+1-555-0100,5,https://linkedin.com/in/john-doe`

    const result = parseCsv(csv)

    expect(result[0].phoneNumber).toBe('+15550100')
    expect(result[0].yearsInRole).toBe(5)
    expect(result[0].linkedinUrl).toBe('https://linkedin.com/in/john-doe')
    expect(result[0].isValid).toBe(true)
  })

  it('should leave phoneNumber, yearsInRole, and linkedinUrl undefined when absent', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com`

    const result = parseCsv(csv)

    expect(result[0].phoneNumber).toBeUndefined()
    expect(result[0].yearsInRole).toBeUndefined()
    expect(result[0].linkedinUrl).toBeUndefined()
    expect(result[0].isValid).toBe(true)
  })

  it('should reject a non-numeric yearsInRole', () => {
    const csv = `firstName,lastName,email,yearsInRole
John,Doe,john@example.com,not-a-number`

    const result = parseCsv(csv)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Years at company must be a number')
  })

  it('should reject a negative yearsInRole', () => {
    const csv = `firstName,lastName,email,yearsInRole
John,Doe,john@example.com,-2`

    const result = parseCsv(csv)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Years at company must be a number')
  })

  it('should reject a linkedinUrl that does not point to linkedin.com', () => {
    const csv = `firstName,lastName,email,linkedinUrl
John,Doe,john@example.com,https://facebook.com/john.doe`

    const result = parseCsv(csv)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Invalid LinkedIn URL')
  })

  it('should strip the extension from a phone number with a country code', () => {
    const csv = `firstName,lastName,email,phoneNumber
John,Doe,john@example.com,+1-280-754-0462x2154`

    const result = parseCsv(csv)

    expect(result[0].phoneNumber).toBe('+12807540462')
    expect(result[0].isValid).toBe(true)
  })

  it('should remove dots and mask a number with no country code with a leading +', () => {
    const csv = `firstName,lastName,email,phoneNumber
John,Doe,john@example.com,133.622.7535`

    const result = parseCsv(csv)

    expect(result[0].phoneNumber).toBe('+1336227535')
    expect(result[0].isValid).toBe(true)
  })

  it('should remove dashes and parentheses from other common phone formats', () => {
    const csv = `firstName,lastName,email,phoneNumber
John,Doe,john@example.com,(731)123-9702`

    const result = parseCsv(csv)

    expect(result[0].phoneNumber).toBe('+7311239702')
    expect(result[0].isValid).toBe(true)
  })

  it('should strip one 0 from a double leading-zero (00) international prefix', () => {
    const csv = `firstName,lastName,email,phoneNumber
John,Doe,john@example.com,001-464-312-8555`

    const result = parseCsv(csv)

    expect(result[0].phoneNumber).toBe('+014643128555')
    expect(result[0].isValid).toBe(true)
  })

  it('should normalize a phone number without an extension', () => {
    const csv = `firstName,lastName,email,phoneNumber
John,Doe,john@example.com,+44 20 7946 0958`

    const result = parseCsv(csv)

    expect(result[0].phoneNumber).toBe('+442079460958')
    expect(result[0].isValid).toBe(true)
  })

  it('should reject a value with too few digits to be a phone number', () => {
    const csv = `firstName,lastName,email,phoneNumber
John,Doe,john@example.com,12345`

    const result = parseCsv(csv)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Invalid phone number')
  })

  it('should handle whitespace in fields', () => {
    const csv = `firstName,lastName,email
 John , Doe , john@example.com `

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })
})

describe('normalizePhoneNumber', () => {
  it('strips a "x<digits>" extension from a dashed number with a country code', () => {
    expect(normalizePhoneNumber('+1-280-754-0462x2154')).toBe('+12807540462')
  })

  it('normalizes a spaced international number with no extension', () => {
    expect(normalizePhoneNumber('+44 20 7946 0958')).toBe('+442079460958')
  })

  it('recognizes "ext" and "extension" as extension markers and strips them too', () => {
    expect(normalizePhoneNumber('+1 280 754 0462 ext 2154')).toBe('+12807540462')
    expect(normalizePhoneNumber('+1 280 754 0462 extension 2154')).toBe('+12807540462')
  })

  it('removes dots/dashes/parentheses and masks a number with no country code with a leading +', () => {
    expect(normalizePhoneNumber('133.622.7535')).toBe('+1336227535')
    expect(normalizePhoneNumber('(731)123-9702')).toBe('+7311239702')
    expect(normalizePhoneNumber('063.430.8860x4762')).toBe('+0634308860')
  })

  it('only strips a 0 for a double leading-zero (00) international prefix, not a single leading 0', () => {
    expect(normalizePhoneNumber('063.430.8860')).toBe('+0634308860')
    expect(normalizePhoneNumber('001-464-312-8555')).toBe('+014643128555')
  })

  it('returns null for an implausibly short or long number', () => {
    expect(normalizePhoneNumber('+123')).toBeNull()
    expect(normalizePhoneNumber('+1234567890123456789')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { formatPhone, toE164 } from './phone'

describe('toE164', () => {
  it.each([
    ['(555) 555-0100', '+15555550100'],
    ['5555550100', '+15555550100'],
    ['1 555 555 0100', '+15555550100'],
    ['+1 (555) 555-0100', '+15555550100'],
  ])('%s → %s', (input, out) => expect(toE164(input)).toBe(out))
  it.each(['', '555-0100', '25555550100', '155555501000'])('rejects %j', (input) =>
    expect(toE164(input)).toBeNull(),
  )
})

describe('formatPhone', () => {
  it.each([
    ['', ''],
    ['5', '(5'],
    ['555', '(555'],
    ['5555', '(555) 5'],
    ['555555', '(555) 555'],
    ['5555550', '(555) 555-0'],
    ['5555550100', '(555) 555-0100'],
    ['55555501009', '(555) 555-0100'],
    ['+1 555 555 0100', '(555) 555-0100'],
    ['1', ''],
  ])('%j → %j', (input, out) => expect(formatPhone(input)).toBe(out))
})

/** Normalize US-style input to E.164 (+1XXXXXXXXXX). */
export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/** Format US digits as (XXX) XXX-XXXX while typing. A leading 1/+1 is absorbed. */
export function formatPhone(input: string): string {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('1')) d = d.slice(1) // US area codes never start with 1
  d = d.slice(0, 10)
  if (d.length === 0) return ''
  if (d.length < 4) return `(${d}`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

import { describe, expect, it } from 'vitest'
import { addressProblem, entryErrorKind, objectNameFromUrl, photoPath, tidy, titleTooLong, titleValue } from './entry'

const UID = 'c8a0ccdb-3b34-4bb7-9a04-7afeec552b2b'

describe('address and title', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['12 A', 'short'],
    ['Candlewood Dr', 'number'],
    ['Dr 1221 Candlewood', 'number'],
    ['1221 Candlewood Dr', null],
    ['  1221   Candlewood Dr, Columbus, OH 43235 ', null],
    ['12B Shelley Ct', null],
    ['1' + ' x'.repeat(100), 'long'],
  ])('%j → %s', (input, problem) => {
    expect(addressProblem(input)).toBe(problem)
  })
  it('tidies whitespace', () => {
    expect(tidy('  1221\n Candlewood   Dr ')).toBe('1221 Candlewood Dr')
  })
  it('treats an empty name as no name', () => {
    expect(titleValue('   ')).toBeNull()
    expect(titleValue(' The  Griswold Special ')).toBe('The Griswold Special')
  })
  it('caps the name at 60 characters', () => {
    expect(titleTooLong('x'.repeat(60))).toBe(false)
    expect(titleTooLong(' ' + 'x'.repeat(61))).toBe(true)
  })
})

describe('photo objects', () => {
  it('names uploads in the owner folder with only allowed characters', () => {
    const p = photoPath(UID, 1794506000229, '3f2a-91c0-77aa-4e1b')
    expect(p).toBe(`${UID}/1794506000229-3f2a91c077aa.jpg`)
    expect(p).toMatch(new RegExp(`^${UID}/[A-Za-z0-9][A-Za-z0-9._-]*$`))
  })
  it('finds the object name in a public URL', () => {
    const name = `${UID}/1794506000229-3f2a91c077aa.jpg`
    expect(objectNameFromUrl(`http://127.0.0.1:55321/storage/v1/object/public/houses/${name}`)).toBe(name)
    expect(objectNameFromUrl('https://picsum.photos/seed/wh-lights-1/1200/900')).toBeNull()
    expect(objectNameFromUrl(`https://x.supabase.co/storage/v1/object/public/houses/${UID}/a.jpg?x=1`)).toBeNull()
  })
})

describe('entryErrorKind', () => {
  it.each([
    [{ code: '23505', message: 'duplicate key value violates unique constraint "houses_submitted_by_key"' }, 'already-entered'],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "houses_address_key_key"' }, 'duplicate-address'],
    [{ code: '42501', message: 'new row violates row-level security policy for table "houses"' }, 'rejected'],
    [{ code: '42501', message: 'photo_url must be a photo you uploaded to the houses bucket' }, 'rejected'],
    [{ statusCode: '403', message: 'new row violates row-level security policy' }, 'rejected'],
    [{ statusCode: '413', message: 'The object exceeded the maximum allowed size' }, 'photo-too-large'],
    [new TypeError('Failed to fetch'), 'network'],
    [{ message: 'TypeError: Load failed' }, 'network'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'unknown'],
    [null, 'unknown'],
  ])('%j → %s', (error, kind) => {
    expect(entryErrorKind(error)).toBe(kind)
  })
})

import { describe, expect, it } from 'vitest'
import { directionsLink } from './navigate'

const house = { lat: 40.12314, lng: -83.05157, address: '1221 Candlewood Dr' }

describe('directionsLink', () => {
  it('iPhone (iOS 18.4+): Apple Maps, same tab', () => {
    expect(directionsLink(house, { platform: 'apple', legacyApple: false, handheld: true })).toEqual({
      href: 'https://maps.apple.com/directions?destination=40.123140,-83.051570',
      target: undefined,
      rel: undefined,
      label: 'Directions to 1221 Candlewood Dr (Apple Maps)',
      title: 'Directions in Apple Maps',
    })
  })
  it('older iPhone: the legacy Apple Maps link', () => {
    expect(directionsLink(house, { platform: 'apple', legacyApple: true, handheld: true }).href).toBe(
      'https://maps.apple.com/?daddr=40.123140,-83.051570',
    )
  })
  it('Android: Google Maps, same tab', () => {
    const link = directionsLink(house, { platform: 'google', legacyApple: false, handheld: true })
    expect(link.href).toBe('https://www.google.com/maps/dir/?api=1&destination=40.123140,-83.051570')
    expect(link.target).toBeUndefined()
    expect(link.label).toBe('Directions to 1221 Candlewood Dr (Google Maps)')
  })
  it('desktop: Google Maps in a new tab, and the name says so', () => {
    const link = directionsLink(house, { platform: 'google', legacyApple: false, handheld: false })
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    expect(link.label).toBe('Directions to 1221 Candlewood Dr (Google Maps, opens in a new tab)')
    expect(link.title).toBe('Directions in Google Maps')
  })
})

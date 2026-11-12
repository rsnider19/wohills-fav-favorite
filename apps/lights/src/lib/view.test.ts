import { describe, expect, it } from 'vitest'
import { markerColor, parseHouse, parseView, viewSearch } from './view'

describe('parseView', () => {
  it.each([
    ['', 'lineup'],
    ['?view=map', 'map'],
    ['?house=4&view=map', 'map'],
    ['?view=MAP', 'lineup'],
    ['?view=list', 'lineup'],
  ])('%s → %s', (search, view) => expect(parseView(search)).toBe(view))
})

describe('parseHouse', () => {
  it.each([
    ['?house=4', 4],
    ['?view=map&house=12', 12],
    ['?house= 7 ', 7],
    ['', null],
    ['?house=0', null],
    ['?house=-3', null],
    ['?house=4b', null],
    ['?house=1.5', null],
  ])('%s → %s', (search, n) => expect(parseHouse(search)).toBe(n))
})

describe('viewSearch', () => {
  it('sets the map view and the picked house', () => {
    expect(viewSearch('', 'map')).toBe('?view=map')
    expect(viewSearch('', 'map', 4)).toBe('?view=map&house=4')
    expect(viewSearch('?view=map&house=4', 'map', null)).toBe('?view=map')
  })
  it('the lineup drops view and house', () => {
    expect(viewSearch('?view=map&house=4', 'lineup')).toBe('')
    expect(viewSearch('?house=4', 'lineup', 4)).toBe('')
  })
  it('keeps the other parameters', () => {
    expect(viewSearch('?preview=voting', 'map', 2)).toBe('?preview=voting&view=map&house=2')
    expect(viewSearch('?preview=voting&view=map&house=2', 'lineup')).toBe('?preview=voting')
  })
})

describe('markerColor', () => {
  it('rotates through the six bulb colors by entry number', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(markerColor)).toEqual(['red', 'green', 'gold', 'blue', 'magenta', 'white', 'red'])
  })
  it('is defined for odd input', () => {
    expect(markerColor(0)).toBe('white')
    expect(markerColor(-2)).toBe('green')
  })
})

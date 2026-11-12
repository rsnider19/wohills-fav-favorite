import { describe, expect, it } from 'vitest'
import { parseRoute, routeHref } from './route'

describe('parseRoute', () => {
  it.each([
    ['/', 'home'],
    ['', 'home'],
    ['/enter', 'enter'],
    ['/enter/', 'enter'],
    ['/admin', 'admin'],
    ['/admin//', 'admin'],
    ['/nope', 'home'],
    ['/enter/extra', 'home'],
  ])('%s → %s', (path, route) => {
    expect(parseRoute(path)).toBe(route)
  })
})

describe('routeHref', () => {
  it('builds plain paths', () => {
    expect(routeHref('home')).toBe('/')
    expect(routeHref('enter', '?house=4&signin')).toBe('/enter')
  })
  it('keeps the admin preview across pages', () => {
    expect(routeHref('admin', '?preview=voting&signin')).toBe('/admin?preview=voting')
  })
})

import { expect, it } from 'vitest'
import { cn } from './cn'

it('lets a later token utility override an earlier one', () => {
  expect(cn('rounded-card p-8', 'rounded-none')).toBe('p-8 rounded-none')
  expect(cn('rounded-dialog', 'rounded-card')).toBe('rounded-card')
  expect(cn('bg-surface text-fg', 'bg-primary')).toBe('text-fg bg-primary')
  expect(cn('bg-scrim/50', 'bg-fg/70')).toBe('bg-fg/70')
  expect(cn('shadow-card', 'shadow-selected')).toBe('shadow-selected')
  expect(cn('rounded-field px-4', 'rounded-full')).toBe('px-4 rounded-full')
  expect(cn('hover:shadow-card-hover', 'hover:shadow-none')).toBe('hover:shadow-none')
})

it('keeps utilities from different groups', () => {
  // font-display is a family, font-semibold a weight; text-fg a color, text-sm a size.
  expect(cn('font-display font-semibold', 'font-sans')).toBe('font-semibold font-sans')
  expect(cn('text-fg text-sm', 'text-primary')).toBe('text-sm text-primary')
})

it('drops falsy values', () => {
  expect(cn('a', false, undefined, null, '', 'b')).toBe('a b')
})

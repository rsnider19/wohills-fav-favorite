import { extendTailwindMerge } from 'tailwind-merge'

/** Joins class names and lets later utilities override earlier ones
 *  (`cn('bg-surface', 'bg-primary')` → `bg-primary`). Our token names
 *  are registered so tailwind-merge knows e.g. `font-display` is a font family
 *  and `rounded-card` a radius. Keep in sync with tokens.css. */
export const cn = extendTailwindMerge({
  extend: {
    theme: {
      color: ['bg', 'sunken', 'surface', 'field', 'fg', 'primary', 'primary-fg', 'accent', 'danger', 'scrim', 'glow'],
      font: ['display', 'sans'],
      radius: ['card', 'dialog', 'field'],
      shadow: ['card', 'card-hover', 'selected'],
    },
  },
})

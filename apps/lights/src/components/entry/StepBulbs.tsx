import { ENTER } from '../../copy'

/** "Step 2 of 3" as three bulbs on a wire: done and current are lit, the rest are dark.
 *  Static (no animation). */
export function StepBulbs({ current }: { current: number }) {
  return (
    <ol data-slot="step-bulbs" aria-label={`Step ${current + 1} of ${ENTER.steps.length}`}>
      {ENTER.steps.map((label, i) => (
        <li key={label} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'} aria-current={i === current ? 'step' : undefined}>
          <span data-slot="step-bulb" aria-hidden="true" />
          <span>{label}</span>
        </li>
      ))}
    </ol>
  )
}

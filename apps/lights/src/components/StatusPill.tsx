import type { HouseStatus } from '../types'
import { MY_ENTRY } from '../copy'

const BULB: Record<HouseStatus, string> = { pending: 'gold', approved: 'green', hidden: 'red' }

/** Where an entry stands, as a pill with a colored bulb (same look as the phase badge). */
export function StatusPill({ status, label }: { status: HouseStatus; label?: string }) {
  return (
    <span data-slot="status-pill" data-status={status}>
      <span data-slot="phase-dot" data-bulb={BULB[status]} aria-hidden="true" />
      {label ?? MY_ENTRY.status[status]}
    </span>
  )
}

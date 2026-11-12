import { formatPhone } from '@wohills/core'
import { FOOTER } from '../copy'

interface Props {
  /** E.164 digits from the session ("15555550103"), or null when signed out. */
  phone: string | null
  isAdmin: boolean
  onSignOut: () => void
}

export function Footer({ phone, isAdmin, onSignOut }: Props) {
  return (
    <footer data-slot="site-footer" className="mt-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-fg/75 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <p>{FOOTER.madeWith}</p>
          <p>
            {FOOTER.rule}{' '}
            <span className="text-primary" aria-hidden="true">
              ★
            </span>
          </p>
        </div>
        {phone && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {isAdmin && (
              <span className="rounded-full bg-primary px-2.5 py-1 font-display text-[0.65rem] tracking-[0.1em] text-primary-fg uppercase">
                {FOOTER.admin}
              </span>
            )}
            {/* M5 adds the admin's moderation link here. */}
            <span>{FOOTER.signedInAs(formatPhone(phone))}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-11 px-1 font-semibold text-fg underline decoration-primary underline-offset-4"
            >
              {FOOTER.signOut}
            </button>
          </div>
        )}
      </div>
    </footer>
  )
}

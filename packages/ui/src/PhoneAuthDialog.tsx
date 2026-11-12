import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { formatPhone, toE164, useSupabase } from '@wohills/core'
import { cn } from './cn'
import { Dialog } from './Dialog'
import { DEFAULT_PHONE_AUTH_LABELS, type PhoneAuthLabels } from './labels'

export interface PhoneAuthDialogProps {
  onSuccess: () => void
  onCancel: () => void
  /** Extra line under the title on the phone step (e.g. which vote is pending). */
  notice?: ReactNode
  labels?: Partial<PhoneAuthLabels>
  className?: string
}

const inputClass =
  'w-full rounded-field border border-fg/20 bg-field px-4 py-3 text-fg outline-none focus:border-fg'
const submitClass =
  'w-full rounded-full bg-fg px-4 py-3 font-semibold text-bg transition hover:bg-primary disabled:opacity-50'

/** Two-step SMS sign-in (phone → 6-digit code) against the provider's Supabase client. */
export function PhoneAuthDialog({ onSuccess, onCancel, notice, labels, className }: PhoneAuthDialogProps) {
  const l = { ...DEFAULT_PHONE_AUTH_LABELS, ...labels }
  const supabase = useSupabase()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phoneInput, setPhoneInput] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const e164 = toE164(phoneInput)
    if (!e164) {
      setError(l.invalidPhone)
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setPhone(e164)
    setStep('code')
    setTimeout(() => codeRef.current?.focus(), 50)
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(code)) {
      setError(l.invalidCode)
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onSuccess()
  }

  return (
    <Dialog onClose={onCancel} label={l.dialogLabel} className={className}>
      <div className="mb-6" data-slot="auth-header">
        <p data-slot="auth-eyebrow" className="mb-2 text-xs font-semibold tracking-[0.25em] text-primary uppercase">
          {step === 'phone' ? l.phoneEyebrow : l.codeEyebrow}
        </p>
        <h2 data-slot="auth-title" className="font-display text-3xl font-semibold">
          {step === 'phone' ? l.phoneTitle : l.codeTitle}
        </h2>
        {step === 'phone' && notice && (
          <p data-slot="auth-notice" className="mt-2 text-sm font-medium text-primary">
            {notice}
          </p>
        )}
        <p data-slot="auth-help" className="mt-2 text-sm leading-relaxed text-fg/60">
          {step === 'phone' ? l.phoneHelp : l.codeHelp(phone)}
        </p>
      </div>

      {step === 'phone' ? (
        <form data-slot="auth-form" onSubmit={sendCode} className="space-y-4">
          <input
            data-slot="auth-phone-input"
            aria-label={l.phoneInputLabel}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder={l.phonePlaceholder}
            value={phoneInput}
            onChange={(e) => {
              const raw = e.target.value
              // Reformat when adding; accept deletions as-is so backspacing
              // over ")" or "-" doesn't get stuck re-inserting it.
              setPhoneInput(raw.length > phoneInput.length ? formatPhone(raw) : raw)
            }}
            autoFocus
            className={cn(inputClass, 'text-lg')}
          />
          <button data-slot="auth-submit" type="submit" disabled={busy} className={submitClass}>
            {busy ? l.sending : l.send}
          </button>
        </form>
      ) : (
        <form data-slot="auth-form" onSubmit={verifyCode} className="space-y-4">
          <input
            data-slot="auth-code-input"
            aria-label={l.codeInputLabel}
            ref={codeRef}
            type="text"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={cn(inputClass, 'text-center font-display text-3xl tracking-[0.5em]')}
          />
          <button data-slot="auth-submit" type="submit" disabled={busy} className={submitClass}>
            {busy ? l.verifying : l.verify}
          </button>
          <button
            data-slot="auth-change-number"
            type="button"
            onClick={() => {
              setStep('phone')
              setCode('')
              setError(null)
            }}
            className="w-full text-sm text-fg/55 underline-offset-4 hover:underline"
          >
            {l.changeNumber}
          </button>
        </form>
      )}

      {error && (
        <p data-slot="auth-error" role="alert" className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </Dialog>
  )
}

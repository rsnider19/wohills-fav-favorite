import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

/** Normalize US-style input to E.164 (+1XXXXXXXXXX). */
function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/** Format US digits as (XXX) XXX-XXXX while typing. A leading 1/+1 is absorbed. */
function formatPhone(input: string): string {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('1')) d = d.slice(1) // US area codes never start with 1
  d = d.slice(0, 10)
  if (d.length === 0) return ''
  if (d.length < 4) return `(${d}`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

interface Props {
  /** Duo the user tapped before being asked to sign in; their vote is applied after auth. */
  voteFor?: string
  onSuccess: () => void
  onCancel: () => void
}

export default function PhoneAuth({ voteFor, onSuccess, onCancel }: Props) {
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
      setError('Please enter a valid 10-digit US phone number.')
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
      setError('The code is 6 digits.')
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="pop w-full max-w-md rounded-3xl border border-ink/10 bg-card p-8 text-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to vote"
      >
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold tracking-[0.25em] text-red uppercase">
            {step === 'phone' ? '★ One neighbor, one vote' : '★ Check your texts'}
          </p>
          <h2 className="font-display text-3xl font-semibold">
            {step === 'phone' ? 'Verify to vote' : 'Enter your code'}
          </h2>
          {step === 'phone' && voteFor && (
            <p className="mt-2 text-sm font-medium text-red">
              Your vote for {voteFor} will be cast as soon as you verify.
            </p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            {step === 'phone'
              ? 'We text you a 6-digit code to keep it fair. Your number is only used to verify you.'
              : `We sent a 6-digit code to ${phone}.`}
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={sendCode} className="space-y-4">
            <input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="(555) 555-0100"
              value={phoneInput}
              onChange={(e) => {
                const raw = e.target.value
                // Reformat when adding; accept deletions as-is so backspacing
                // over ")" or "-" doesn't get stuck re-inserting it.
                setPhoneInput(raw.length > phoneInput.length ? formatPhone(raw) : raw)
              }}
              autoFocus
              className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3 text-lg text-ink outline-none focus:border-ink"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ink px-4 py-3 font-semibold text-paper transition hover:bg-red disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Text me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <input
              ref={codeRef}
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3 text-center font-display text-3xl tracking-[0.5em] text-ink outline-none focus:border-ink"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ink px-4 py-3 font-semibold text-paper transition hover:bg-red disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Verify & vote'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setCode('')
                setError(null)
              }}
              className="w-full text-sm text-ink/55 underline-offset-4 hover:underline"
            >
              Use a different number
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red/10 px-3 py-2 text-sm text-red-deep">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

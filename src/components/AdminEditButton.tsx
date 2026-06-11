import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Entry } from '../types'

interface Props {
  entry: Entry
  /** Called with a toast message after saving (or failing). */
  onDone: (message: string, ok: boolean) => void
}

const inputClass =
  'w-full rounded-xl border border-ink/20 bg-white px-3 py-2 text-ink outline-none focus:border-ink'
const labelClass = 'mb-1 block text-[10px] font-semibold tracking-[0.2em] text-ink/50 uppercase'

export default function AdminEditButton({ entry, onDone }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ theme: '', street: '', emoji: '', description: '' })

  function openModal() {
    setForm({
      theme: entry.theme,
      street: entry.street,
      emoji: entry.emoji,
      description: entry.description ?? '',
    })
    setOpen(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase
      .from('entries')
      .update({
        theme: form.theme.trim(),
        street: form.street.trim(),
        emoji: form.emoji.trim() || '🎆',
        description: form.description.trim() || null,
      })
      .eq('id', entry.id)
      .select()
    setBusy(false)
    // RLS silently matches zero rows for non-admins — treat that as failure.
    if (error || !data?.length) {
      onDone('Could not save changes.', false)
      return
    }
    setOpen(false)
    onDone(`${form.theme.trim()} updated ✏️`, true)
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-full bg-ink/80 px-3 py-1.5 text-[11px] font-bold tracking-wider text-paper uppercase ring-1 ring-paper/25 backdrop-blur transition hover:bg-ink"
      >
        ✏️ Edit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="pop w-full max-w-md rounded-3xl border border-ink/10 bg-card p-8 text-ink shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${entry.theme}`}
          >
            <p className="mb-2 text-xs font-semibold tracking-[0.25em] text-red uppercase">
              ★ Edit float
            </p>
            <h2 className="mb-5 font-display text-3xl font-semibold">{entry.theme}</h2>
            <form onSubmit={save} className="space-y-4">
              <div className="flex gap-3">
                <div className="grow">
                  <label className={labelClass} htmlFor={`theme-${entry.id}`}>
                    Theme
                  </label>
                  <input
                    id={`theme-${entry.id}`}
                    required
                    value={form.theme}
                    onChange={(e) => setForm({ ...form, theme: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="w-20">
                  <label className={labelClass} htmlFor={`emoji-${entry.id}`}>
                    Emoji
                  </label>
                  <input
                    id={`emoji-${entry.id}`}
                    value={form.emoji}
                    onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                    className={`${inputClass} text-center`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor={`street-${entry.id}`}>
                  Street
                </label>
                <input
                  id={`street-${entry.id}`}
                  required
                  value={form.street}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`description-${entry.id}`}>
                  Description
                </label>
                <textarea
                  id={`description-${entry.id}`}
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grow rounded-full border border-ink/25 px-4 py-2.5 text-sm font-semibold transition hover:border-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="grow rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-red disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

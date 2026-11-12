import { useId } from 'react'
import { ENTER } from '../../copy'
import { TITLE_MAX, tidy, titleTooLong } from '../../lib/entry'
import type { House } from '../../types'
import { HouseCard } from '../HouseCard'
import { Note } from '../Page'

interface Props {
  title: string
  onTitle: (title: string) => void
  /** The card as it will appear (photo, name, address). */
  preview: House
  mode: 'new' | 'edit'
  /** Notes under the preview: approval, the edit lock, re-approval. */
  notes: { text: string; tone: 'info' | 'error' }[]
  sending: string | null
  error: { text: string; action?: { label: string; onClick: () => void } } | null
  onBack: () => void
  onSend: () => void
}

/** Step 3: the optional name, a preview of the card, the rules, and Send. */
export function DetailsStep({ title, onTitle, preview, mode, notes, sending, error, onBack, onSend }: Props) {
  const titleId = useId()
  const tooLong = titleTooLong(title)
  return (
    <div className="space-y-6">
      <h2 data-slot="step-title">{ENTER.detailsTitle}</h2>

      <div>
        <label htmlFor={titleId} data-slot="field-label">
          {ENTER.titleLabel}
        </label>
        <input
          id={titleId}
          data-slot="field"
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={ENTER.titlePlaceholder}
          value={title}
          aria-invalid={tooLong || undefined}
          aria-describedby={`${titleId}-help`}
          onChange={(e) => onTitle(e.target.value)}
        />
        <p id={`${titleId}-help`} data-slot="field-help" className="flex justify-between gap-4">
          <span className={tooLong ? 'text-danger' : undefined}>{tooLong ? ENTER.titleTooLong(TITLE_MAX) : ENTER.titleHelp}</span>
          <span aria-hidden="true">{ENTER.titleCount(tidy(title).length, TITLE_MAX)}</span>
        </p>
      </div>

      <div>
        <p data-slot="field-label">{ENTER.previewLabel}</p>
        <div data-slot="card-preview" data-new={mode === 'new' || undefined} className="mx-auto max-w-sm">
          <HouseCard house={preview} />
        </div>
      </div>

      <div className="space-y-2">
        {notes.map((n) => (
          <Note key={n.text} tone={n.tone}>
            {n.text}
          </Note>
        ))}
      </div>

      {error && (
        <div className="space-y-3">
          <Note tone="error" live="alert">
            {error.text}
          </Note>
          {error.action && (
            <button type="button" className="btn-ghost" onClick={error.action.onClick}>
              {error.action.label}
            </button>
          )}
        </div>
      )}

      <p role="status" className="sr-only">
        {sending}
      </p>
      <div className="flex items-center justify-between gap-3 border-t border-fg/10 pt-6">
        <button type="button" data-slot="text-button" disabled={sending !== null} onClick={onBack}>
          <span aria-hidden="true">←</span> {ENTER.back}
        </button>
        <button type="button" data-slot="send" className="btn-bulb" disabled={sending !== null || tooLong} onClick={onSend}>
          {sending ?? (mode === 'new' ? ENTER.submit : ENTER.save)}
        </button>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useSupabase } from '@wohills/core'
import { ENTER } from '../../copy'
import { entryErrorKind, tidy, titleValue } from '../../lib/entry'
import { inBox, type Box, type LatLng } from '../../lib/geo'
import { EntryLockedError, submitEntry, updateEntry, type PreparedPhoto, type Stage } from '../../lib/submit'
import type { EntryRow } from '../../types'
import { DetailsStep } from './DetailsStep'
import { PhotoStep } from './PhotoStep'
import { PlaceStep } from './PlaceStep'
import { StepBulbs } from './StepBulbs'

export type DraftPhoto = PreparedPhoto & { previewUrl: string }
export type PointSource = 'gps' | 'address' | 'map' | 'existing'

interface Props {
  mode: 'new' | 'edit'
  uid: string
  /** The entry being edited (mode 'edit'). */
  house?: EntryRow
  box: Box
  votingOpensAt: Date | null
  /** Voting has started while entries are still open: this entry will be locked at once. */
  late: boolean
  onDone: (row: EntryRow) => void
  /** "This phone already has an entry": go and show it. */
  onShowEntry: () => void
  onCancel?: () => void
}

type SendError = keyof typeof ENTER.sendErrors

/** The three-step form for a new entry or an owner's edit. Nothing is uploaded until Send;
 *  then the photo goes up, the row goes in, and the page moves on (lib/submit.ts). */
export function SubmitWizard({ mode, uid, house, box, votingOpensAt, late, onDone, onShowEntry, onCancel }: Props) {
  const client = useSupabase()
  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState<DraftPhoto | null>(null)
  const [address, setAddress] = useState(house?.address ?? '')
  const [point, setPoint] = useState<LatLng | null>(house ? { lat: house.lat, lng: house.lng } : null)
  const [source, setSource] = useState<PointSource | null>(house ? 'existing' : null)
  const [title, setTitle] = useState(house?.title ?? '')
  const [stage, setStage] = useState<Stage | null>(null)
  const [error, setError] = useState<SendError | null>(null)
  const top = useRef<HTMLDivElement>(null)

  // Fetch the map chunk (MapLibre) in the background while they take the photo, so the pin
  // step opens at once. Same module as PlaceStep's React.lazy, so it downloads only once.
  useEffect(() => {
    const t = setTimeout(() => void import('../../map/MiniMap').catch(() => {}), 2000)
    return () => clearTimeout(t)
  }, [])

  // The preview's object URL lives as long as the photo is the current one.
  useEffect(() => {
    if (!photo) return
    return () => URL.revokeObjectURL(photo.previewUrl)
  }, [photo])

  function go(next: number) {
    setStep(next)
    setError(null)
    top.current?.scrollIntoView({ block: 'start' })
  }

  async function send() {
    if (!point) return
    setError(null)
    const draft = { photo, address: tidy(address), point, title: titleValue(title) }
    try {
      const row =
        mode === 'new'
          ? await submitEntry(client, uid, draft, { onStage: setStage })
          : await updateEntry(client, house!, draft, { onStage: setStage })
      onDone(row)
    } catch (err) {
      setError(await sendErrorKind(err))
    } finally {
      setStage(null)
    }
  }

  /** 42501 means "closed" or "outside the geofence" (M3 D26): ask the database which. */
  async function sendErrorKind(err: unknown): Promise<SendError> {
    if (err instanceof EntryLockedError) return 'locked'
    const kind = entryErrorKind(err)
    if (kind !== 'rejected') return kind
    const { data: open } = await client.rpc('submissions_are_open')
    if (open === false) return 'closed'
    if (point && !inBox(point, box)) return 'outside'
    return 'unknown'
  }

  const notes: { text: string; tone: 'info' | 'error' }[] = []
  if (mode === 'new' || house?.status !== 'approved') notes.push({ text: ENTER.approvalNote, tone: 'info' })
  if (mode === 'edit' && house?.status === 'approved') notes.push({ text: ENTER.reapprovalNote, tone: 'error' })
  notes.push(late ? { text: ENTER.lateNote, tone: 'error' } : { text: ENTER.editNote(votingOpensAt), tone: 'info' })

  const errorAction =
    error === 'already-entered'
      ? { label: ENTER.seeMyEntry, onClick: onShowEntry }
      : error === 'duplicate-address' || error === 'outside'
        ? { label: ENTER.changePlace, onClick: () => go(1) }
        : error === 'photo-too-large'
          ? { label: ENTER.changePhoto, onClick: () => go(0) }
          : undefined

  return (
    <div ref={top} className="scroll-mt-4">
      <div className="mb-6 flex items-center justify-between gap-4">
        <StepBulbs current={step} />
        {mode === 'edit' && onCancel && (
          <button type="button" data-slot="text-button" onClick={onCancel}>
            {ENTER.cancelEdit}
          </button>
        )}
      </div>
      {step === 0 && (
        <PhotoStep
          photo={photo}
          currentUrl={house?.photo_url ?? null}
          onPhoto={setPhoto}
          onNext={() => go(1)}
        />
      )}
      {step === 1 && (
        <PlaceStep
          box={box}
          address={address}
          point={point}
          source={source}
          initial={house ? { lat: house.lat, lng: house.lng } : null}
          onAddress={setAddress}
          onPoint={(p, s) => {
            setPoint(p)
            setSource(s)
          }}
          onBack={() => go(0)}
          onNext={() => go(2)}
        />
      )}
      {step === 2 && point && (
        <DetailsStep
          title={title}
          onTitle={setTitle}
          mode={mode}
          preview={{
            id: house?.id ?? 'preview',
            entry_number: house?.entry_number ?? 0,
            title: titleValue(title),
            address: tidy(address),
            lat: point.lat,
            lng: point.lng,
            photo_url: photo?.previewUrl ?? house?.photo_url ?? '',
            submitted_by: uid,
          }}
          notes={notes}
          sending={stage ? ENTER.stage[stage] : null}
          error={error ? { text: ENTER.sendErrors[error], action: errorAction } : null}
          onBack={() => go(1)}
          onSend={send}
        />
      )}
    </div>
  )
}

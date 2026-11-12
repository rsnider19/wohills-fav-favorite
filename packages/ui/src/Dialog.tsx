import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from './cn'

export interface DialogProps {
  /** Called on backdrop click and Escape. The caller unmounts the dialog. */
  onClose: () => void
  /** Accessible name (aria-label). */
  label: string
  children: ReactNode
  /** Merged onto the panel. */
  className?: string
  backdropClassName?: string
}

/** Modal shell: blurred backdrop, popping panel, click-outside and Escape to close.
 *  On open, focus moves into the panel unless a child already took it (autoFocus). */
export function Dialog({ onClose, label, children, className, backdropClassName }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Callers pass inline arrows; read the latest one so the key listener isn't
  // re-registered on every parent render (the parade re-renders every second).
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  // A text selection dragged out of the panel ends with a click on the backdrop;
  // only a press that also started on the backdrop closes the dialog.
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      data-slot="dialog-backdrop"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4 backdrop-blur-sm',
        backdropClassName,
      )}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) close.current()
      }}
    >
      <div
        ref={panelRef}
        data-slot="dialog-panel"
        className={cn(
          'pop w-full max-w-md rounded-dialog border border-fg/10 bg-surface p-8 text-fg shadow-2xl outline-none',
          className,
        )}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  )
}

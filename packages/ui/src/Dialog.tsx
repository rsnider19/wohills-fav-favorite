import { useEffect, type ReactNode } from 'react'
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

/** Modal shell: blurred backdrop, popping panel, click-outside and Escape to close. */
export function Dialog({ onClose, label, children, className, backdropClassName }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      data-slot="dialog-backdrop"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4 backdrop-blur-sm',
        backdropClassName,
      )}
      onClick={onClose}
    >
      <div
        data-slot="dialog-panel"
        className={cn(
          'pop w-full max-w-md rounded-dialog border border-fg/10 bg-surface p-8 text-fg shadow-2xl',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  )
}

import { useRef, type ReactNode } from 'react'

export interface PhotoPickerProps {
  onFile: (file: File) => void
  busy?: boolean
  disabled?: boolean
  /** No HEIC by default: iOS converts to JPEG when HEIC isn't accepted. */
  accept?: string
  /** 'environment' opens the rear camera directly on phones; omit to offer the library too. */
  capture?: 'environment' | 'user'
  children: ReactNode
  busyLabel?: ReactNode
  className?: string
}

/** A button that opens the file/camera picker and hands back one image file. */
export function PhotoPicker({
  onFile,
  busy = false,
  disabled = false,
  accept = 'image/jpeg,image/png,image/webp',
  capture,
  children,
  busyLabel = 'Uploading…',
  className,
}: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset so picking the same file again still fires onChange.
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
      <button
        type="button"
        data-slot="photo-picker"
        disabled={busy || disabled}
        onClick={() => inputRef.current?.click()}
        className={className}
      >
        {busy ? busyLabel : children}
      </button>
    </>
  )
}

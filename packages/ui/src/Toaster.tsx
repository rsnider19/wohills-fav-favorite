import { cn } from './cn'

/** Renders the current toast from core's useToast(); nothing when `message` is null. */
export function Toaster({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null
  return (
    <div
      data-slot="toast"
      role="status"
      className={cn(
        'pop fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-fg px-6 py-3 text-sm font-medium text-bg shadow-xl',
        className,
      )}
    >
      {message}
    </div>
  )
}

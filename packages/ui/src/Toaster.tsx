import { cn } from './cn'

/** Renders the current toast from core's useToast(). The live region is always
 *  mounted (and empty when `message` is null): screen readers announce text
 *  added to an existing region, not a region inserted along with its text. */
export function Toaster({ message, className }: { message: string | null; className?: string }) {
  return (
    <div data-slot="toast-region" role="status">
      {message && (
        <div
          data-slot="toast"
          className={cn(
            'pop fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-fg px-6 py-3 text-sm font-medium text-bg shadow-xl',
            className,
          )}
        >
          {message}
        </div>
      )}
    </div>
  )
}

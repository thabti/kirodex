import { IconX } from '@tabler/icons-react'

/** Shared panel shell used by all slash panels */
export function PanelShell({ children, onDismiss }: { children: React.ReactNode; onDismiss?: () => void }) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-[300] mb-2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/5 floating-panel">
      {onDismiss && (
        <div className="flex items-center justify-end px-2 pt-1.5">
          <button
            type="button"
            aria-label="Close panel"
            tabIndex={0}
            onMouseDown={(e) => { e.preventDefault(); onDismiss() }}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconX className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
      {children}
    </div>
  )
}

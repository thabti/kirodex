import { useCallback } from 'react'
import { IconX } from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ipc } from '@/lib/ipc'
import type { ChangelogEntry } from '@/lib/changelog'
import defaultAppIcon from '../../../src-tauri/icons/prod/icon.png'

const FEATURE_REQUEST_URL = 'https://github.com/thabti/kirodex/issues/new'

interface WhatsNewDialogProps {
  open: boolean
  entry: ChangelogEntry
  onDismiss: () => void
}

export const WhatsNewDialog = ({ open, entry, onDismiss }: WhatsNewDialogProps) => {
  const handleRequestFeature = useCallback(() => {
    ipc.openUrl(FEATURE_REQUEST_URL)
  }, [])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) onDismiss()
  }, [onDismiss])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-4 p-6 pb-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted/80">
            <img src={defaultAppIcon} alt="Kirodex" width={36} height={36} className="rounded-lg" />
          </div>
          <div className="min-w-0 pt-0.5">
            <DialogTitle className="text-xl font-semibold">What&apos;s New</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">v{entry.version}</DialogDescription>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            aria-label="Close"
          >
            <IconX className="size-4" />
          </button>
        </DialogHeader>

        <ul className="space-y-4 px-6 pb-6" role="list">
          {entry.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start gap-3 text-[14px] leading-relaxed text-foreground/80">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground/30" aria-hidden />
              {highlight}
            </li>
          ))}
        </ul>

        <DialogFooter className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" onClick={handleRequestFeature}>
            Request feature
          </Button>
          <Button size="lg" onClick={onDismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

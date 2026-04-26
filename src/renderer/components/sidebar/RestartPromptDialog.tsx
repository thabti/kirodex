import { useCallback, useState } from 'react'
import { IconRefresh, IconLoader2 } from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUpdateStore } from '@/stores/updateStore'

export const RestartPromptDialog = () => {
  const isReady = useUpdateStore((s) => s.status === 'ready')
  const updateInfo = useUpdateStore((s) => s.updateInfo)
  const triggerRestart = useUpdateStore((s) => s.triggerRestart)
  const [isRestarting, setIsRestarting] = useState(false)

  const handleRestart = useCallback(async () => {
    if (isRestarting) return
    setIsRestarting(true)
    try {
      await triggerRestart?.()
    } catch {
      setIsRestarting(false)
    }
  }, [triggerRestart, isRestarting])

  const handleDismiss = useCallback(() => {
    if (isRestarting) return
    useUpdateStore.getState().reset()
  }, [isRestarting])

  return (
    <Dialog open={isReady} onOpenChange={(open) => { if (!open) handleDismiss() }}>
      <DialogContent showCloseButton={false} className="z-[60] max-w-sm" overlayClassName="z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <IconRefresh className="size-5 text-primary" aria-hidden />
            Update ready
          </DialogTitle>
          <DialogDescription>
            {updateInfo?.version
              ? `Kirodex v${updateInfo.version} has been downloaded. Restart to apply the update.`
              : 'A new version has been downloaded. Restart to apply the update.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={isRestarting}>
            Later
          </Button>
          <Button size="sm" onClick={handleRestart} disabled={isRestarting}>
            {isRestarting ? (
              <><IconLoader2 className="size-4 animate-spin" aria-hidden /> Restarting…</>
            ) : (
              'Restart now'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

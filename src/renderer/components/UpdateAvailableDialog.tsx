import { useCallback, useState } from 'react'
import { IconDownload, IconLoader2, IconRefresh, IconSparkles } from '@tabler/icons-react'
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
import { useUpdateChecker } from '@/hooks/useUpdateChecker'

export const UpdateAvailableDialog = () => {
  const { status, updateInfo, progress, dismissedVersion, downloadAndInstall, restart, dismissVersion } = useUpdateChecker()
  const [isRestarting, setIsRestarting] = useState(false)

  const isAvailable = status === 'available' && updateInfo !== null && dismissedVersion !== updateInfo.version
  const isDownloading = status === 'downloading'
  const isReady = status === 'ready'
  const isOpen = isAvailable || isDownloading || isReady

  const downloadPercent = progress?.total
    ? Math.round((progress.downloaded / progress.total) * 100)
    : null

  const handleDismiss = useCallback(() => {
    if (isDownloading || isRestarting) return
    if (updateInfo?.version) {
      dismissVersion(updateInfo.version)
    }
  }, [isDownloading, isRestarting, updateInfo?.version, dismissVersion])

  const handleUpdate = useCallback(() => {
    downloadAndInstall()
  }, [downloadAndInstall])

  const handleRestart = useCallback(async () => {
    if (isRestarting) return
    setIsRestarting(true)
    try {
      await restart()
    } catch {
      setIsRestarting(false)
    }
  }, [restart, isRestarting])

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) handleDismiss()
  }, [handleDismiss])

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="z-[60] max-w-sm" overlayClassName="z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isReady
              ? <IconRefresh className="size-5 text-primary" aria-hidden />
              : <IconSparkles className="size-5 text-primary" aria-hidden />}
            {isReady ? 'Update ready' : `Kirodex v${updateInfo?.version ?? ''} available`}
          </DialogTitle>
          <DialogDescription>
            {isReady
              ? 'The update has been downloaded. Restart to apply.'
              : isDownloading
                ? downloadPercent !== null
                  ? `Downloading update... ${downloadPercent}%`
                  : 'Downloading update...'
                : 'A new version is ready to install.'}
          </DialogDescription>
        </DialogHeader>

        {isDownloading && (
          <div className="px-6 pb-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${downloadPercent ?? 0}%` }}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {isReady ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={isRestarting}>
                Later
              </Button>
              <Button size="sm" onClick={handleRestart} disabled={isRestarting}>
                {isRestarting ? (
                  <><IconLoader2 className="size-4 animate-spin" aria-hidden /> Restarting…</>
                ) : (
                  <><IconRefresh className="size-4" aria-hidden /> Restart now</>
                )}
              </Button>
            </>
          ) : isDownloading ? (
            <Button variant="ghost" size="sm" disabled>
              <IconLoader2 className="size-4 animate-spin" aria-hidden />
              Downloading…
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={handleDismiss}>
                Dismiss
              </Button>
              <Button size="sm" onClick={handleUpdate}>
                <IconDownload className="size-4" aria-hidden />
                Update now
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

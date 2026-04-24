import { useState, useEffect, useCallback } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import {
  IconBrandGithub, IconDownload, IconRefresh, IconLoader2, IconCheck,
} from '@tabler/icons-react'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { useUpdateStore } from '@/stores/updateStore'
import { cn } from '@/lib/utils'
import { handleExternalLinkClick, handleExternalLinkKeyDown } from '@/lib/open-external'
import { useSettingsStore } from '@/stores/settingsStore'
import defaultAppIcon from '../../../../src-tauri/icons/prod/icon.png'

interface AboutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AboutDialog = ({ open, onOpenChange }: AboutDialogProps) => {
  const [appVersion, setAppVersion] = useState('')
  const { status, updateInfo, progress, error, triggerDownload } = useUpdateStore()
  const customAppIcon = useSettingsStore((s) => s.settings.customAppIcon)
  const displayIcon = customAppIcon || defaultAppIcon

  useEffect(() => {
    if (open) getVersion().then(setAppVersion).catch(() => {})
  }, [open])

  const handleCheck = useCallback(async () => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      useUpdateStore.getState().setStatus('checking')
      const update = await check()
      if (update) {
        useUpdateStore.getState().setUpdateInfo({
          version: update.version,
          date: update.date ?? undefined,
          body: update.body ?? undefined,
        })
        useUpdateStore.getState().setStatus('available')
      } else {
        useUpdateStore.getState().setStatus('idle')
        useUpdateStore.getState().setUpdateInfo(null)
      }
    } catch (err) {
      useUpdateStore.getState().setError(err instanceof Error ? err.message : 'Check failed')
    }
  }, [])

  const handleDownload = useCallback(() => {
    triggerDownload?.()
  }, [triggerDownload])

  const handleRestart = useCallback(async () => {
    try {
      const { prepareForRelaunch } = await import('@/lib/relaunch')
      await prepareForRelaunch()
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err) {
      console.error('[updater] restart failed:', err)
      useUpdateStore.getState().setError(err instanceof Error ? err.message : 'Restart failed')
    }
  }, [])

  const isChecking = status === 'checking'
  const isAvailable = status === 'available'
  const isDownloading = status === 'downloading'
  const isReady = status === 'ready'
  const isError = status === 'error'
  const pct = progress?.total ? Math.round((progress.downloaded / progress.total) * 100) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs gap-0 p-0" showCloseButton={false}>
        <div className="flex flex-col items-center px-6 pt-8 pb-6">
          <img
            src={displayIcon}
            alt="Kirodex"
            className="size-20 rounded-2xl shadow-lg"
            draggable={false}
          />
          <DialogTitle className="mt-4 text-center text-lg font-semibold">
            Kirodex
          </DialogTitle>
          <DialogDescription className="mt-1 text-center text-[13px] text-muted-foreground">
            {appVersion ? `Version ${appVersion}` : 'Loading…'}
          </DialogDescription>

          {/* Update status */}
          <div className="mt-4 flex flex-col items-center gap-2">
            {isChecking && (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <IconLoader2 className="size-3.5 animate-spin" />
                Checking for updates…
              </span>
            )}
            {isAvailable && updateInfo && (
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <IconDownload className="size-3.5" />
                Update to v{updateInfo.version}
              </button>
            )}
            {isDownloading && (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <IconLoader2 className="size-3.5 animate-spin" />
                {pct !== null ? `Downloading… ${pct}%` : 'Downloading…'}
              </span>
            )}
            {isReady && (
              <button
                type="button"
                onClick={handleRestart}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <IconRefresh className="size-3.5" />
                Restart to finish
              </button>
            )}
            {isError && (
              <span className="text-[12px] text-red-600 dark:text-red-400">{error ?? 'Update check failed'}</span>
            )}
            {status === 'idle' && (
              <button
                type="button"
                onClick={handleCheck}
                className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <IconCheck className="size-3.5" />
                Check for updates
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/40 px-6 py-3">
          <span className="text-[11px] text-muted-foreground">
            © 2026 Thabti
          </span>
          <a
            href="https://github.com/thabti/kirodex"
            onClick={handleExternalLinkClick}
            onKeyDown={handleExternalLinkKeyDown}
            aria-label="Kirodex on GitHub"
            tabIndex={0}
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-md',
              'text-muted-foreground transition-colors hover:text-foreground',
            )}
          >
            <IconBrandGithub className="size-4" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}

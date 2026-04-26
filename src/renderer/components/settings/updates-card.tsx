import { useState } from 'react'
import { IconDownload, IconRefresh, IconLoader2 } from '@tabler/icons-react'
import { useUpdateStore } from '@/stores/updateStore'
import { useTaskStore } from '@/stores/taskStore'
import { SettingRow } from './settings-shared'

export const UpdatesCard = () => {
  const { status, updateInfo, progress, error, triggerDownload, triggerRestart } = useUpdateStore()
  const [isChecking, setIsChecking] = useState(false)

  const handleCheck = async () => {
    setIsChecking(true)
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
    } finally {
      setIsChecking(false)
    }
  }

  const handleDownload = () => {
    if (!triggerDownload) return
    // Close settings so the UpdateAvailableDialog can show above everything
    useTaskStore.getState().setSettingsOpen(false)
    triggerDownload()
  }

  const handleRestart = async () => {
    if (!triggerRestart) return
    try {
      await triggerRestart()
    } catch (err) {
      console.error('[updater] restart failed:', err)
      useUpdateStore.getState().setError(err instanceof Error ? err.message : 'Restart failed')
    }
  }

  const isCheckingState = isChecking || status === 'checking'
  const pct = progress?.total ? Math.round((progress.downloaded / progress.total) * 100) : null

  const statusText = (() => {
    if (status === 'checking') return 'Checking for updates...'
    if (status === 'available' && updateInfo) return `v${updateInfo.version} available`
    if (status === 'downloading') return pct !== null ? `Downloading... ${pct}%` : 'Downloading...'
    if (status === 'ready') return 'Update installed — restart to finish'
    if (status === 'error') return error ?? 'Update check failed'
    return 'Kirodex is up to date'
  })()

  return (
    <SettingRow label="Software updates" description={statusText}>
      <div className="flex items-center gap-2">
        {status === 'available' && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={!triggerDownload}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            <IconDownload className="size-3" />
            Update now
          </button>
        )}
        {status === 'ready' && (
          <button
            type="button"
            onClick={handleRestart}
            disabled={!triggerRestart}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            <IconRefresh className="size-3" />
            Restart
          </button>
        )}
        {(status === 'idle' || status === 'error') && (
          <button
            type="button"
            onClick={handleCheck}
            disabled={isCheckingState}
            className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {isCheckingState ? <IconLoader2 className="size-3 animate-spin" /> : <IconRefresh className="size-3" />}
            Check
          </button>
        )}
        {status === 'downloading' && <IconLoader2 className="size-4 animate-spin text-primary" />}
      </div>
    </SettingRow>
  )
}

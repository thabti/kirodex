import { useEffect, useRef, useCallback } from 'react'
import { useUpdateStore } from '@/stores/updateStore'
import { track } from '@/lib/analytics'
import { getVersion } from '@tauri-apps/api/app'

import type { Update } from '@tauri-apps/plugin-updater'

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

export const useUpdateChecker = () => {
  const store = useUpdateStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingUpdateRef = useRef<Update | null>(null)

  const checkForUpdate = useCallback(async () => {
    const { status } = useUpdateStore.getState()
    if (status === 'downloading' || status === 'ready') return

    useUpdateStore.getState().setStatus('checking')
    useUpdateStore.getState().setProgress(null)

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (!update) {
        useUpdateStore.getState().setStatus('idle')
        useUpdateStore.getState().setUpdateInfo(null)
        track('update_check', { result: 'none' })
        return
      }

      pendingUpdateRef.current = update
      useUpdateStore.getState().setUpdateInfo({
        version: update.version,
        date: update.date ?? undefined,
        body: update.body ?? undefined,
      })
      useUpdateStore.getState().setStatus('available')
      track('update_check', { result: 'available', latest_version: update.version })
      const currentVersion = await getVersion().catch(() => null)
      track('update_available', { latest_version: update.version, current_version: currentVersion })
    } catch (err) {
      console.warn('[updater] check failed:', err)
      useUpdateStore.getState().setError(
        err instanceof Error ? err.message : 'Update check failed',
      )
      track('update_check', { result: 'error' })
    }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    if (!pendingUpdateRef.current) return

    useUpdateStore.getState().setStatus('downloading')
    useUpdateStore.getState().setProgress({ downloaded: 0, total: null })
    const toVersion = pendingUpdateRef.current.version
    const fromVersion = await getVersion().catch(() => null)

    try {
      let totalBytes: number | null = null
      let downloadedBytes = 0

      await pendingUpdateRef.current.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = (event.data as { contentLength?: number }).contentLength ?? null
        } else if (event.event === 'Progress') {
          downloadedBytes += (event.data as { chunkLength: number }).chunkLength
          useUpdateStore.getState().setProgress({
            downloaded: downloadedBytes,
            total: totalBytes,
          })
        } else if (event.event === 'Finished') {
          useUpdateStore.getState().setProgress({
            downloaded: downloadedBytes,
            total: totalBytes,
          })
          track('update_downloaded', { from_version: fromVersion, to_version: toVersion })
        }
      })

      useUpdateStore.getState().setStatus('ready')
      track('update_installed', { from_version: fromVersion, to_version: toVersion })
    } catch (err) {
      console.error('[updater] download failed:', err)
      useUpdateStore.getState().setError(
        err instanceof Error ? err.message : 'Download failed',
      )
    }
  }, [])

  const restart = useCallback(async () => {
    try {
      const toVersion = pendingUpdateRef.current?.version ?? null
      track('update_restart_clicked', { to_version: toVersion })
      const { prepareForRelaunch } = await import('@/lib/relaunch')
      await prepareForRelaunch()
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err) {
      console.error('[updater] restart failed:', err)
      useUpdateStore.getState().setError(
        err instanceof Error ? err.message : 'Restart failed',
      )
    }
  }, [])

  // Auto-check on mount + periodic interval
  useEffect(() => {
    checkForUpdate().catch(() => {})
    intervalRef.current = setInterval(() => { checkForUpdate().catch(() => {}) }, CHECK_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [checkForUpdate])

  // Expose downloadAndInstall to the store so other components (e.g. sidebar badge) can trigger it
  useEffect(() => {
    if (store.status === 'available') {
      // If another component (e.g. UpdatesCard) called check() and found an update,
      // pendingUpdateRef may be null or stale. Re-check to get a fresh Update object.
      if (!pendingUpdateRef.current || pendingUpdateRef.current.version !== store.updateInfo?.version) {
        checkForUpdate().catch(() => {})
        return
      }
      useUpdateStore.getState().setTriggerDownload(() => { downloadAndInstall() })
    } else {
      useUpdateStore.getState().setTriggerDownload(null)
    }
  }, [store.status, store.updateInfo?.version, downloadAndInstall, checkForUpdate])

  // Expose restart to the store so the restart dialog can trigger it
  useEffect(() => {
    if (store.status === 'ready') {
      useUpdateStore.getState().setTriggerRestart(() => restart())
    } else {
      useUpdateStore.getState().setTriggerRestart(null)
    }
  }, [store.status, restart])

  return {
    ...store,
    checkForUpdate,
    downloadAndInstall,
    restart,
  }
}

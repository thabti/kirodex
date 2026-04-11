import { useEffect, useRef, useCallback } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { useUpdateStore } from '@/stores/updateStore'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

/** Shared update object from the last successful check */
let pendingUpdate: Awaited<ReturnType<typeof check>> | null = null

export const useUpdateChecker = () => {
  const store = useUpdateStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkForUpdate = useCallback(async () => {
    const { status } = useUpdateStore.getState()
    if (status === 'downloading' || status === 'ready') return

    useUpdateStore.getState().setStatus('checking')
    useUpdateStore.getState().setProgress(null)

    try {
      const update = await check()
      if (!update) {
        useUpdateStore.getState().setStatus('idle')
        useUpdateStore.getState().setUpdateInfo(null)
        return
      }

      pendingUpdate = update
      useUpdateStore.getState().setUpdateInfo({
        version: update.version,
        date: update.date ?? undefined,
        body: update.body ?? undefined,
      })
      useUpdateStore.getState().setStatus('available')
    } catch (err) {
      console.warn('[updater] check failed:', err)
      useUpdateStore.getState().setError(
        err instanceof Error ? err.message : 'Update check failed',
      )
    }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    if (!pendingUpdate) return

    useUpdateStore.getState().setStatus('downloading')
    useUpdateStore.getState().setProgress({ downloaded: 0, total: null })

    try {
      let totalBytes: number | null = null
      let downloadedBytes = 0

      await pendingUpdate.downloadAndInstall((event) => {
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
        }
      })

      useUpdateStore.getState().setStatus('ready')
    } catch (err) {
      console.error('[updater] download failed:', err)
      useUpdateStore.getState().setError(
        err instanceof Error ? err.message : 'Download failed',
      )
    }
  }, [])

  const restart = useCallback(async () => {
    await relaunch()
  }, [])

  // Auto-check on mount + periodic interval
  useEffect(() => {
    checkForUpdate()
    intervalRef.current = setInterval(checkForUpdate, CHECK_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [checkForUpdate])

  return {
    ...store,
    checkForUpdate,
    downloadAndInstall,
    restart,
  }
}

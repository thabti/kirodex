import { useEffect, useRef } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.0
const ZOOM_STEP = 0.05

const clampZoom = (value: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))

/**
 * Clamps the Tauri webview zoom level between 50% and 100%.
 * Intercepts Ctrl+wheel (trackpad pinch) and keyboard zoom shortcuts.
 */
export const useZoomLimit = (): void => {
  const zoomRef = useRef(ZOOM_MAX)

  useEffect(() => {
    const webview = getCurrentWebview()

    const applyZoom = (next: number): void => {
      const clamped = clampZoom(next)
      if (clamped === zoomRef.current) return
      zoomRef.current = clamped
      webview.setZoom(clamped)
    }

    const handleWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const direction = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      applyZoom(zoomRef.current + direction)
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        applyZoom(zoomRef.current + ZOOM_STEP)
      } else if (e.key === '-') {
        e.preventDefault()
        applyZoom(zoomRef.current - ZOOM_STEP)
      } else if (e.key === '0') {
        e.preventDefault()
        applyZoom(ZOOM_MAX)
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
}

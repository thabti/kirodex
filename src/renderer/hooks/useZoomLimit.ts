import { useEffect, useRef } from 'react'
import { isTauriRuntime } from '@/lib/web-rpc'
import { useSettingsStore } from '@/stores/settingsStore'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_DEFAULT = 0.9
const ZOOM_STEP = 0.1
const ZOOM_STORAGE_KEY = 'kirodex-zoom-level'

// Font size limits (must match appearance-section.tsx)
const FONT_SIZE_UI_MIN = 10
const FONT_SIZE_CHAT_MIN = 8
const FONT_SIZE_MAX = 22

const clampZoom = (value: number): number =>
  Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 100) / 100

// localStorage throws in private browsing, incognito, and quota-exceeded
// contexts — keep zoom usable even when persistence is unavailable.
const readStoredZoom = (): string | null => {
  try {
    return localStorage.getItem(ZOOM_STORAGE_KEY)
  } catch {
    return null
  }
}

const writeStoredZoom = (value: number): void => {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(value))
  } catch (e) {
    console.warn('[useZoomLimit] failed to persist zoom level', e)
  }
}

/**
 * Manages webview zoom level with Cmd+/Cmd- keyboard shortcuts and
 * Ctrl+wheel (trackpad pinch). Persists zoom level across sessions.
 *
 * When zoom changes, font sizes (UI and chat) are scaled proportionally
 * so that the user's configured ratio between UI and chat font sizes is
 * preserved. The base font sizes are synced from settings whenever the
 * user changes them (e.g. via the appearance panel), preventing stale
 * values from accumulating rounding errors.
 */
export const useZoomLimit = (): void => {
  const zoomRef = useRef(ZOOM_DEFAULT)
  // Track the "base" font sizes at the default zoom level so we can compute
  // scaled values. Updated whenever settings change.
  const baseFontSizesRef = useRef<{ ui: number; chat: number } | null>(null)

  useEffect(() => {
    const setNativeZoom = (value: number): void => {
      if (!isTauriRuntime()) return
      import('@tauri-apps/api/webview')
        .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(value))
        .catch(() => {})
    }

    // Restore persisted zoom level or fall back to the default
    const stored = readStoredZoom()
    const initial = stored ? clampZoom(parseFloat(stored)) : ZOOM_DEFAULT
    zoomRef.current = initial
    setNativeZoom(initial)

    // Capture the base font sizes on mount (the user's configured values).
    const { settings } = useSettingsStore.getState()
    baseFontSizesRef.current = {
      ui: settings.fontSize ?? 14,
      chat: settings.chatFontSize ?? settings.fontSize ?? 15,
    }

    // Subscribe to settings changes so that if the user adjusts font size
    // while zoomed, baseFontSizesRef stays in sync and the next zoom step
    // computes from the correct base.
    const unsubSettings = useSettingsStore.subscribe((state) => {
      const newUi = state.settings.fontSize ?? 14
      const newChat = state.settings.chatFontSize ?? state.settings.fontSize ?? 15
      const current = baseFontSizesRef.current
      if (current && (current.ui !== newUi || current.chat !== newChat)) {
        baseFontSizesRef.current = { ui: newUi, chat: newChat }
        // Re-apply zoom scaling with the updated base sizes
        const ratio = zoomRef.current / ZOOM_DEFAULT
        const scaledUi = Math.round(Math.max(FONT_SIZE_UI_MIN, Math.min(FONT_SIZE_MAX, newUi * ratio)))
        const scaledChat = Math.round(Math.max(FONT_SIZE_CHAT_MIN, Math.min(FONT_SIZE_MAX, newChat * ratio)))
        document.documentElement.style.setProperty('--app-font-size', `${scaledUi}px`)
        document.documentElement.style.fontSize = `${scaledUi}px`
        document.documentElement.style.setProperty('--chat-font-size', `${scaledChat}px`)
      }
    })

    const applyZoom = (next: number): void => {
      const clamped = clampZoom(next)
      if (clamped === zoomRef.current) return
      zoomRef.current = clamped
      setNativeZoom(clamped)
      writeStoredZoom(clamped)

      // Scale font sizes proportionally with zoom.
      // We compute from the base sizes so repeated zoom steps don't accumulate
      // rounding errors.
      if (baseFontSizesRef.current) {
        const ratio = clamped / ZOOM_DEFAULT
        const newUi = Math.round(Math.max(FONT_SIZE_UI_MIN, Math.min(FONT_SIZE_MAX, baseFontSizesRef.current.ui * ratio)))
        const newChat = Math.round(Math.max(FONT_SIZE_CHAT_MIN, Math.min(FONT_SIZE_MAX, baseFontSizesRef.current.chat * ratio)))

        // Apply directly to CSS variables for immediate visual feedback.
        document.documentElement.style.setProperty('--app-font-size', `${newUi}px`)
        document.documentElement.style.fontSize = `${newUi}px`
        document.documentElement.style.setProperty('--chat-font-size', `${newChat}px`)
      }
    }

    const handleWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const direction = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      applyZoom(zoomRef.current + direction)
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        e.stopPropagation()
        applyZoom(zoomRef.current + ZOOM_STEP)
      } else if (e.key === '-') {
        e.preventDefault()
        e.stopPropagation()
        applyZoom(zoomRef.current - ZOOM_STEP)
      } else if (e.key === '0') {
        e.preventDefault()
        e.stopPropagation()
        applyZoom(ZOOM_DEFAULT)
      }
    }

    // Use capture phase so zoom shortcuts are handled BEFORE other keydown listeners
    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      unsubSettings()
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])
}

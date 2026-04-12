import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { cn } from '@/lib/utils'

export const TrafficLights = () => {
  const [isWindowFocused, setIsWindowFocused] = useState(true)

  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true)
    const handleBlur = () => setIsWindowFocused(false)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return (
    <div className={cn('traffic-lights-group', !isWindowFocused && 'window-unfocused')}>
      <button
        type="button"
        aria-label="Close"
        onClick={() => void getCurrentWindow().close()}
        className="traffic-light traffic-light-close"
      >
        <span className="symbol">×</span>
      </button>
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => void getCurrentWindow().minimize()}
        className="traffic-light traffic-light-minimize"
      >
        <span className="symbol">−</span>
      </button>
      <button
        type="button"
        aria-label="Maximize"
        onClick={() => void getCurrentWindow().isFullscreen().then(f => getCurrentWindow().setFullscreen(!f))}
        className="traffic-light traffic-light-maximize"
      >
        <span className="symbol">⤢</span>
      </button>
    </div>
  )
}

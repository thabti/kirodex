import { memo, useState, useRef, useEffect } from 'react'
import { IconChevronDown, IconRefresh } from '@tabler/icons-react'
import { useSettingsStore, type ModelOption } from '@/stores/settingsStore'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { getModelIcon } from '@/lib/model-icons'

const RETRY_DELAY_MS = 10_000

export const ModelPicker = memo(function ModelPicker() {
  const models = useSettingsStore((s) => s.availableModels)
  const currentId = useSettingsStore((s) => s.currentModelId)
  const modelsError = useSettingsStore((s) => s.modelsError)
  const [open, setOpen] = useState(false)
  const [isTimedOut, setIsTimedOut] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (models.length > 0) {
      setIsTimedOut(false)
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    timerRef.current = setTimeout(() => setIsTimedOut(true), RETRY_DELAY_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [models.length])

  useEffect(() => {
    if (!modelsError) return
    setIsShaking(true)
    const id = setTimeout(() => setIsShaking(false), 400)
    return () => clearTimeout(id)
  }, [modelsError])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleRetry = () => {
    setIsTimedOut(false)
    ipc.probeCapabilities().catch(() => {})
    timerRef.current = setTimeout(() => setIsTimedOut(true), RETRY_DELAY_MS)
  }

  const current = models.find((m) => m.modelId === currentId)
  const label = current?.name ?? currentId ?? 'Model'
  const triggerIconKey = current?.modelId ?? current?.name ?? currentId ?? ''

  if (models.length === 0) {
    if (modelsError || isTimedOut) return (
      <button
        type="button"
        onClick={handleRetry}
        style={isShaking ? { animation: 'var(--animate-shake)' } : undefined}
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12px] text-destructive/80 transition-colors hover:text-destructive"
        aria-label="Retry loading models"
      >
        <IconRefresh className="size-3" />
        <span>Retry</span>
      </button>
    )
    return (
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <div className="h-2.5 w-16 animate-pulse rounded bg-muted-foreground/15" />
      </div>
    )
  }

  return (
    <div ref={ref} data-testid="model-picker" className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="shrink-0">{getModelIcon(triggerIconKey, { size: 13 })}</span>
        <span className="hidden max-w-[8rem] truncate @[480px]/toolbar:inline">{label}</span>
        <IconChevronDown className="hidden size-3 shrink-0 opacity-50 @[480px]/toolbar:block" aria-hidden />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-[200] mb-2 min-w-[200px] rounded-xl border border-border bg-popover py-1.5 shadow-xl">
          {models.map((m) => (
            <button
              key={m.modelId}
              type="button"
              onMouseDown={(e) => {
                e.stopPropagation()
                const { activeWorkspace, setProjectPref } = useSettingsStore.getState()
                if (activeWorkspace) {
                  setProjectPref(activeWorkspace, { modelId: m.modelId })
                } else {
                  useSettingsStore.setState({ currentModelId: m.modelId })
                }
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent',
                m.modelId === currentId ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}
            >
              <span className="shrink-0">{getModelIcon(m.modelId || m.name, { size: 14 })}</span>
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

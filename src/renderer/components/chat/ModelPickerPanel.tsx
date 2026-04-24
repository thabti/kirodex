import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { useSettingsStore } from '@/stores/settingsStore'
import { ipc } from '@/lib/ipc'
import { PanelShell } from './PanelShell'

export const ModelPickerPanel = memo(function ModelPickerPanel({ onDismiss }: { onDismiss: () => void }) {
  const models = useSettingsStore((s) => s.availableModels)
  const currentId = useSettingsStore((s) => s.currentModelId)
  const modelsError = useSettingsStore((s) => s.modelsError)
  const [query, setQuery] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!modelsError) return
    setIsShaking(true)
    const id = setTimeout(() => setIsShaking(false), 400)
    return () => clearTimeout(id)
  }, [modelsError])

  const filtered = useMemo(() => {
    if (!query.trim()) return models
    return models
      .map((m) => {
        const nameScore = fuzzyScore(query, m.name)
        const idScore = fuzzyScore(query, m.modelId)
        const best = nameScore !== null && idScore !== null ? Math.min(nameScore, idScore) : nameScore ?? idScore
        return { model: m, score: best }
      })
      .filter((r): r is { model: typeof models[number]; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.model)
  }, [models, query])

  const handleSelect = (modelId: string) => {
    const { activeWorkspace, setProjectPref } = useSettingsStore.getState()
    if (activeWorkspace) {
      setProjectPref(activeWorkspace, { modelId })
    } else {
      useSettingsStore.setState({ currentModelId: modelId })
    }
    onDismiss()
  }

  const handleRetry = () => {
    ipc.probeCapabilities().catch(() => {})
  }

  if (models.length === 0) return (
    <PanelShell onDismiss={onDismiss}>
      <div
        className="flex items-center justify-between px-3 py-3"
        style={isShaking ? { animation: 'var(--animate-shake)' } : undefined}
      >
        <p className={cn('text-xs', modelsError ? 'text-destructive/80' : 'text-muted-foreground')}>
          {modelsError ?? 'No models available'}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Retry loading models"
        >
          <IconRefresh className="size-3" />
          Retry
        </button>
      </div>
    </PanelShell>
  )

  return (
    <PanelShell onDismiss={onDismiss}>
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Models</span>
      </div>
      {models.length > 5 && (
        <div className="px-3 pb-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            autoFocus
            className="w-full rounded-md border border-border/40 bg-background/50 px-2 py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-border/80"
          />
        </div>
      )}
      <ul className="max-h-[200px] overflow-y-auto pb-1">
        {filtered.map((m) => {
          const isActive = m.modelId === currentId
          return (
            <li
              key={m.modelId}
              role="option"
              aria-selected={isActive}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(m.modelId) }}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <span className={cn('size-1.5 shrink-0 rounded-full', isActive ? 'bg-primary' : 'bg-transparent')} />
              <span className={cn('flex-1 truncate', isActive && 'font-medium')}>{m.name}</span>
              {isActive && <span className="text-[10px] text-primary">active</span>}
            </li>
          )
        })}
      </ul>
    </PanelShell>
  )
})

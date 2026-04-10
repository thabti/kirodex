import { useState, useMemo } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

export interface DebugEntry {
  id: number
  timestamp: string
  type: string
  data: unknown
}

interface DebugLogProps {
  entries: DebugEntry[]
  onClear: () => void
}

export function DebugLog({ entries, onClear }: DebugLogProps) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(
    () => (filter ? entries.filter((e) => e.type.includes(filter)) : entries).slice(-100),
    [entries, filter]
  )

  const types = useMemo(() => [...new Set(entries.map((e) => e.type))], [entries])

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-2 border-b px-2 py-1">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-6 rounded border bg-input px-1 text-[11px] text-foreground"
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} entries</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClear}>
          <IconTrash className="h-3 w-3" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            No debug messages
          </div>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="rounded border bg-card/50 p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-muted-foreground">{entry.timestamp}</span>
                <span className="font-mono text-[10px] text-accent">{entry.type}</span>
              </div>
              <pre className="font-mono text-[10px] leading-4 overflow-auto max-h-32 whitespace-pre-wrap break-all text-muted-foreground">
                {JSON.stringify(entry.data, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

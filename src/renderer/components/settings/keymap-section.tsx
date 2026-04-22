import { useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { SectionHeader, SettingsCard } from './settings-shared'

const IS_MAC = navigator.platform.toUpperCase().includes('MAC')
const MOD = IS_MAC ? '\u2318' : 'Ctrl'
const SHIFT = IS_MAC ? '\u21E7' : 'Shift'

interface KeymapEntry { command: string; keys: string; group: string }

const KEYMAP: KeymapEntry[] = [
  { group: 'Navigation', command: 'Previous thread', keys: `${MOD}+${SHIFT}+[` },
  { group: 'Navigation', command: 'Next thread', keys: `${MOD}+${SHIFT}+]` },
  { group: 'Navigation', command: 'Jump to thread 1–9', keys: `${MOD}+1 … 9` },
  { group: 'Panels', command: 'Toggle sidebar', keys: `${MOD}+B` },
  { group: 'Panels', command: 'Toggle terminal', keys: `${MOD}+J` },
  { group: 'Panels', command: 'Toggle diff panel', keys: `${MOD}+D` },
  { group: 'Panels', command: 'Open settings', keys: `${MOD}+,` },
  { group: 'Actions', command: 'New project', keys: `${MOD}+O` },
  { group: 'Actions', command: 'New thread', keys: `${MOD}+N` },
  { group: 'Actions', command: 'Close thread', keys: `${MOD}+W` },
  { group: 'Chat', command: 'Send message', keys: 'Enter' },
  { group: 'Chat', command: 'New line', keys: `${SHIFT}+Enter` },
  { group: 'Chat', command: 'Previous message', keys: '\u2191 (at start)' },
  { group: 'Chat', command: 'Focus chat input', keys: `${MOD}+L` },
  { group: 'Chat', command: 'Search messages', keys: `${MOD}+F` },
  { group: 'Chat', command: 'Pause agent', keys: 'Escape (while running)' },
]

export const KeymapSection = () => {
  const [keymapFilter, setKeymapFilter] = useState('')
  const q = keymapFilter.toLowerCase()
  const filtered = q
    ? KEYMAP.filter((e) => e.command.toLowerCase().includes(q) || e.keys.toLowerCase().includes(q) || e.group.toLowerCase().includes(q))
    : KEYMAP
  const groups = [...new Set(filtered.map((e) => e.group))]

  return (
    <>
      <SectionHeader section="keymap" />

      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={keymapFilter}
          onChange={(e) => setKeymapFilter(e.target.value)}
          placeholder="Search shortcuts…"
          aria-label="Search keyboard shortcuts"
          className="flex h-9 w-full rounded-lg border border-input bg-background/50 pl-9 pr-4 text-[12px] placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {groups.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12">
          <IconSearch className="size-5 text-muted-foreground/40" />
          <p className="text-[13px] text-muted-foreground">No matching shortcuts</p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group}>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
          <SettingsCard className="divide-y divide-border/30 !py-0 overflow-hidden">
            {filtered.filter((e) => e.group === group).map((entry) => (
              <div key={entry.command} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/10">
                <span className="text-[13px] text-foreground/90">{entry.command}</span>
                <kbd className="shrink-0 rounded-md border border-border/60 bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground shadow-sm">
                  {entry.keys}
                </kbd>
              </div>
            ))}
          </SettingsCard>
        </div>
      ))}
    </>
  )
}

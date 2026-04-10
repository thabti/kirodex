import { useState, useRef, useEffect } from 'react'
import { IconChevronDown, IconCode } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ipc } from '@/lib/ipc'

interface EditorInfo {
  bin: string
  label: string
  icon: React.ReactNode
}

const ZedIcon = () => (
  <svg aria-hidden className="size-3.5" fill="none" viewBox="0 0 96 96">
    <g clipPath="url(#zed-a)">
      <path fill="currentColor" fillRule="evenodd" d="M9 6a3 3 0 0 0-3 3v66H0V9a9 9 0 0 1 9-9h80.379c4.009 0 6.016 4.847 3.182 7.682L43.055 57.187H57V51h6v7.688a4.5 4.5 0 0 1-4.5 4.5H37.055L26.743 73.5H73.5V36h6v37.5a6 6 0 0 1-6 6H20.743L10.243 90H87a3 3 0 0 0 3-3V21h6v66a9 9 0 0 1-9 9H6.621c-4.009 0-6.016-4.847-3.182-7.682L52.757 39H39v6h-6v-7.5a4.5 4.5 0 0 1 4.5-4.5h21.257l10.5-10.5H22.5V60h-6V22.5a6 6 0 0 1 6-6h52.757L85.757 6H9Z" clipRule="evenodd" />
    </g>
    <defs><clipPath id="zed-a"><path fill="#fff" d="M0 0h96v96H0z" /></clipPath></defs>
  </svg>
)

const CursorIcon = () => (
  <svg aria-hidden className="size-3.5" viewBox="0 0 24 24" fill="none">
    <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z" fill="currentColor" />
  </svg>
)

const EDITOR_MAP: Record<string, Omit<EditorInfo, 'bin'>> = {
  cursor: { label: 'Cursor', icon: <CursorIcon /> },
  code: { label: 'VS Code', icon: <IconCode className="size-3.5" /> },
  zed: { label: 'Zed', icon: <ZedIcon /> },
  windsurf: { label: 'Windsurf', icon: <IconCode className="size-3.5" /> },
}

let cachedEditors: EditorInfo[] | null = null

export function OpenInEditorGroup({ workspace }: { workspace: string }) {
  const [editors, setEditors] = useState<EditorInfo[]>(cachedEditors ?? [])
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cachedEditors) return
    ipc.detectEditors().then((bins) => {
      const detected = bins
        .map((bin) => ({ bin, ...(EDITOR_MAP[bin] ?? { label: bin, icon: <IconCode className="size-3.5" /> }) }))
      cachedEditors = detected
      setEditors(detected)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const open = (bin: string) => { void ipc.openInEditor(workspace, bin); setMenuOpen(false) }

  if (editors.length === 0) return null

  const primary = editors[0]
  const rest = editors.slice(1)

  return (
    <div ref={ref} className="relative flex w-fit">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => open(primary.bin)}
            className="inline-flex h-6 items-center gap-1 rounded-l-md border border-input bg-popover px-1.5 text-xs text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 dark:bg-input/32">
            {primary.icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open in {primary.label}</TooltipContent>
      </Tooltip>
      {rest.length > 0 && (
        <>
          <div className="pointer-events-none relative z-[2] w-px bg-input dark:bg-input/32" />
          <button type="button" aria-label="More editors" onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-r-md border border-input bg-popover text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 dark:bg-input/32">
            <IconChevronDown className="size-3.5" aria-hidden />
          </button>
        </>
      )}
      {menuOpen && rest.length > 0 && (
        <div className="absolute right-0 top-7 z-[200] min-w-[130px] rounded-lg border border-border bg-popover py-1 shadow-lg">
          {rest.map((e) => (
            <button key={e.bin} type="button" onClick={() => open(e.bin)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors">
              {e.icon}
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

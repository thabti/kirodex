import { memo, useState, useEffect, useMemo, useCallback } from 'react'
import { IconSearch, IconRefresh, IconPhoto } from '@tabler/icons-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { FRAMEWORK_ICONS } from '@/lib/framework-icons'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { ipc } from '@/lib/ipc'

type IconOverride =
  | { type: 'framework'; id: string }
  | { type: 'file'; path: string }

interface IconPickerDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly cwd: string
  readonly onSelect: (override: IconOverride) => void
  readonly onReset: () => void
}

const MAX_IMAGE_SIZE_PX = 0

const FRAMEWORK_IDS = [
  'nextjs', 'react', 'vue', 'svelte', 'angular',
  'rust', 'go', 'python', 'ruby', 'java',
  'typescript', 'javascript', 'php', 'cpp', 'docker',
] as const

const FRAMEWORK_LABELS: Record<string, string> = {
  nextjs: 'Next.js', react: 'React', vue: 'Vue', svelte: 'Svelte', angular: 'Angular',
  rust: 'Rust', go: 'Go', python: 'Python', ruby: 'Ruby', java: 'Java',
  typescript: 'TS', javascript: 'JS', php: 'PHP', cpp: 'C++', docker: 'Docker',
}

type TabId = 'frameworks' | 'file'

const getMimeType = (ext: string): string => {
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  }
  return map[ext] ?? 'application/octet-stream'
}

export const IconPickerDialog = memo(function IconPickerDialog({
  open, onOpenChange, cwd, onSelect, onReset,
}: IconPickerDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('frameworks')
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [imageFiles, setImageFiles] = useState<Array<{ path: string; width: number; height: number }>>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return
    setActiveTab('frameworks')
    setSelectedFramework(null)
    setSelectedFile(null)
    setSearchQuery('')
    setPreviewUrl(null)
    setPreviewError(false)
    let stale = false
    const loadFiles = async (): Promise<void> => {
      try {
        const files = await ipc.listSmallImages(cwd, MAX_IMAGE_SIZE_PX)
        if (stale) return
        setImageFiles(files)
      } catch {
        if (!stale) setImageFiles([])
      }
    }
    void loadFiles()
    return () => { stale = true }
  }, [open, cwd])

  // Load preview for selected file
  useEffect(() => {
    if (!selectedFile || !cwd) { setPreviewUrl(null); setPreviewError(false); return }
    let stale = false
    const loadPreview = async (): Promise<void> => {
      try {
        const base64 = await ipc.readFileBase64(cwd + '/' + selectedFile)
        if (stale || !base64) return
        const ext = selectedFile.split('.').pop()?.toLowerCase() ?? 'png'
        const url = `data:${getMimeType(ext)};base64,${base64}`
        setPreviewUrl(url)
        setPreviewError(false)
      } catch {
        if (!stale) { setPreviewUrl(null); setPreviewError(true) }
      }
    }
    void loadPreview()
    return () => { stale = true }
  }, [selectedFile, cwd])

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return imageFiles
    return imageFiles
      .map((f) => ({ file: f, score: fuzzyScore(searchQuery, f.path) }))
      .filter((r) => r.score !== null)
      .sort((a, b) => a.score! - b.score!)
      .map((r) => r.file)
  }, [imageFiles, searchQuery])

  const selectedImage = useMemo(() => {
    if (!selectedFile) return null
    return imageFiles.find((f) => f.path === selectedFile) ?? null
  }, [imageFiles, selectedFile])

  const handleSelectFramework = useCallback((id: string) => {
    setSelectedFramework(id)
    setSelectedFile(null)
    setPreviewUrl(null)
  }, [])

  const handleConfirmFramework = useCallback(() => {
    if (!selectedFramework) return
    onSelect({ type: 'framework', id: selectedFramework })
  }, [selectedFramework, onSelect])

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path)
    setSelectedFramework(null)
  }, [])

  const handleConfirmFile = useCallback(() => {
    if (!selectedFile) return
    onSelect({ type: 'file', path: selectedFile })
  }, [selectedFile, onSelect])

  const handleReset = useCallback(() => {
    setSelectedFramework(null)
    setSelectedFile(null)
    setPreviewUrl(null)
    onReset()
  }, [onReset])

  // Check if image exceeds max size — no longer needed, Rust filters by dimensions

  const canConfirm = activeTab === 'frameworks' ? !!selectedFramework : !!selectedFile && !previewError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3">
          <DialogTitle className="text-sm font-medium">Change Icon</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          <button
            type="button"
            onClick={() => setActiveTab('frameworks')}
            className={cn(
              'px-3 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px outline-none',
              activeTab === 'frameworks'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            Frameworks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={cn(
              'px-3 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px outline-none',
              activeTab === 'file'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            Project File
          </button>
        </div>

        <div className="flex flex-col px-5 pb-4 pt-3">
          {/* Frameworks tab */}
          {activeTab === 'frameworks' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-5 gap-1">
                {FRAMEWORK_IDS.map((id) => {
                  const Icon = FRAMEWORK_ICONS[id]
                  if (!Icon) return null
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={`Select ${FRAMEWORK_LABELS[id]} icon`}
                      tabIndex={0}
                      onClick={() => handleSelectFramework(id)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        selectedFramework === id && 'ring-1 ring-primary bg-accent',
                      )}
                    >
                      <Icon className="size-6 shrink-0" aria-hidden />
                      <span className="text-[10px] text-muted-foreground truncate w-full text-center leading-tight">{FRAMEWORK_LABELS[id]}</span>
                    </button>
                  )
                })}
              </div>

              {/* Preview */}
              {selectedFramework && (
                <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-background border border-border">
                    {(() => { const Icon = FRAMEWORK_ICONS[selectedFramework]; return Icon ? <Icon className="size-7 rounded-full" aria-hidden /> : null })()}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[12px] font-medium text-foreground">{FRAMEWORK_LABELS[selectedFramework]}</span>
                    <span className="text-[10px] text-muted-foreground">Framework icon</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* File tab — 2 column layout */}
          {activeTab === 'file' && (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <IconSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="text"
                  placeholder="Search images..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search project image files"
                  className="h-7 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-[12px] outline-none placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex gap-3 min-h-[200px]">
                {/* Left: file list */}
                <div className="flex-1 min-w-0 max-h-[200px] overflow-y-auto rounded-md border border-border">
                  {filteredFiles.length === 0 ? (
                    <div className="flex items-center justify-center h-full py-4 text-[11px] text-muted-foreground/60">
                      No image files found
                    </div>
                  ) : (
                    <ul role="listbox" aria-label="Project image files">
                      {filteredFiles.map((file) => (
                        <li key={file.path} role="option" aria-selected={selectedFile === file.path}>
                          <button
                            type="button"
                            tabIndex={0}
                            onClick={() => { handleSelectFile(file.path); setPreviewError(false) }}
                            className={cn(
                              'flex w-full items-center gap-2 px-2.5 py-1 text-left text-[11px] transition-colors hover:bg-accent outline-none focus-visible:bg-accent',
                              selectedFile === file.path && 'bg-accent text-accent-foreground',
                            )}
                          >
                            <IconPhoto className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
                            <span className="truncate text-foreground/80">{file.path}</span>
                            <span className="shrink-0 text-[9px] text-muted-foreground/50 ml-auto">{file.width === 0 && file.height === 0 ? 'SVG' : `${file.width}×${file.height}`}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Right: preview */}
                <div className="w-[140px] shrink-0 flex flex-col items-center justify-center rounded-md border border-border bg-muted/20 p-2">
                  {selectedFile && previewUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center justify-center size-16 rounded-full bg-background border border-border overflow-hidden">
                        <img
                          src={previewUrl}
                          alt=""
                          className="max-w-[56px] max-h-[56px] rounded-full object-cover"
                          aria-hidden
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground text-center truncate w-full">{selectedFile.split('/').pop()}</span>
                      {selectedImage && (
                        <span className="text-[9px] text-muted-foreground/60">{selectedImage.width === 0 && selectedImage.height === 0 ? 'SVG (vector)' : `${selectedImage.width}×${selectedImage.height}px`}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-center">
                      <IconPhoto className="size-6 text-muted-foreground/30" aria-hidden />
                      <span className="text-[10px] text-muted-foreground/50 leading-tight">Select a file to preview</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t border-border/50">
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset to auto-detect icon"
              className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <IconRefresh className="size-3" aria-hidden />
              Reset
            </button>
            <button
              type="button"
              onClick={activeTab === 'frameworks' ? handleConfirmFramework : handleConfirmFile}
              disabled={!canConfirm}
              aria-label="Apply selected icon"
              className="flex h-7 items-center rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Apply
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
})

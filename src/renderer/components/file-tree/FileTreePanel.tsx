import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  IconX, IconRefresh, IconChevronRight, IconChevronDown,
  IconEyeOff, IconEye, IconFoldDown, IconFilePlus, IconFolderPlus,
} from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFileTreeStore, startTreeWatcher, stopTreeWatcher, type TreeEntry } from '@/stores/fileTreeStore'
import { useTaskStore } from '@/stores/taskStore'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { FilePreviewModal } from './FilePreviewModal'
import { FileTypeIcon } from './FileTypeIcon'
import { TreeContextMenu } from './TreeContextMenu'
import { setInAppDragActive, setInAppDragData } from '@/hooks/useAttachments'
import { cn } from '@/lib/utils'

const GIT_STATUS_COLORS: Record<string, string> = {
  M: 'bg-amber-400',
  A: 'bg-emerald-400',
  D: 'bg-red-400',
  R: 'bg-blue-400',
}

// ── Inline Rename Input ──────────────────────────────────────────────────────

const InlineRenameInput = memo(function InlineRenameInput({
  initialValue,
  onSubmit,
  onCancel,
}: {
  initialValue: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      // Select filename without extension
      const dotIndex = initialValue.lastIndexOf('.')
      if (dotIndex > 0) {
        inputRef.current.setSelectionRange(0, dotIndex)
      } else {
        inputRef.current.select()
      }
    }
  }, [initialValue])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submittedRef.current = true
      const trimmed = value.trim()
      if (trimmed && trimmed !== initialValue) {
        onSubmit(trimmed)
      } else {
        onCancel()
      }
    } else if (e.key === 'Escape') {
      submittedRef.current = true
      onCancel()
    }
  }, [value, initialValue, onSubmit, onCancel])

  const handleBlur = useCallback(() => {
    if (submittedRef.current) return
    const trimmed = value.trim()
    if (trimmed && trimmed !== initialValue) {
      onSubmit(trimmed)
    } else {
      onCancel()
    }
  }, [value, initialValue, onSubmit, onCancel])

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="w-full rounded border border-primary/50 bg-background px-1 py-0 text-[12px] text-foreground outline-none"
      onClick={(e) => e.stopPropagation()}
    />
  )
})

// ── Tree Item Component ──────────────────────────────────────────────────────

const TreeItem = memo(function TreeItem({
  entry,
  workspace,
  onContextMenu,
}: {
  entry: TreeEntry
  workspace: string
  onContextMenu: (e: React.MouseEvent, entry: TreeEntry) => void
}) {
  const expandedDirs = useFileTreeStore((s) => s.expandedDirs)
  const loadingDirs = useFileTreeStore((s) => s.loadingDirs)
  const selectedPath = useFileTreeStore((s) => s.selectedPath)
  const renamingPath = useFileTreeStore((s) => s.renamingPath)
  const childrenMap = useFileTreeStore((s) => s.childrenMap)
  const showIgnored = useFileTreeStore((s) => s.showIgnored)
  const toggleDir = useFileTreeStore((s) => s.toggleDir)
  const setSelectedPath = useFileTreeStore((s) => s.setSelectedPath)
  const setPreviewFile = useFileTreeStore((s) => s.setPreviewFile)
  const setRenamingPath = useFileTreeStore((s) => s.setRenamingPath)
  const renameEntry = useFileTreeStore((s) => s.renameEntry)
  const createFile = useFileTreeStore((s) => s.createFile)
  const createDirectory = useFileTreeStore((s) => s.createDirectory)

  const isExpanded = expandedDirs.has(entry.path)
  const isLoading = loadingDirs.has(entry.path)
  const isSelected = selectedPath === entry.path
  const isRenaming = renamingPath === entry.path
  const isDeleted = entry.gitStatus === 'D'
  const children = childrenMap.get(entry.path)
  // Backend already applies the gitignore filter based on `showIgnored`
  // (`respectGitignore = !showIgnored`), so children arrive pre-filtered. We
  // still respect `isExcluded` here for entries flagged out by other rules.
  const visibleChildren = useMemo(() => {
    if (!children) return []
    if (showIgnored) return children
    return children.filter((c) => !c.isExcluded)
  }, [children, showIgnored])

  const handleClick = useCallback(() => {
    if (isDeleted) return
    setSelectedPath(entry.path)
    if (entry.isDir) {
      toggleDir(entry.path)
    } else {
      setPreviewFile(entry.path)
    }
  }, [entry, isDeleted, toggleDir, setSelectedPath, setPreviewFile])

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedPath(entry.path)
    onContextMenu(e, entry)
  }, [entry, setSelectedPath, onContextMenu])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (isDeleted) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'copy'
    setInAppDragActive(true)
    if (entry.isDir) {
      e.dataTransfer.setData('application/x-kirodex-folder', entry.path)
      setInAppDragData({ type: 'folder', path: `${workspace}/${entry.path}` })
    } else {
      const projectFile = {
        path: `${workspace}/${entry.path}`,
        name: entry.name,
        dir: `${workspace}/${entry.path.split('/').slice(0, -1).join('/')}`,
        isDir: false,
        ext: entry.ext,
        modifiedAt: entry.modifiedAt,
      }
      e.dataTransfer.setData('application/x-kirodex-file', JSON.stringify(projectFile))
      setInAppDragData({ type: 'file', data: projectFile as any })
    }
    e.dataTransfer.setData('text/plain', `${workspace}/${entry.path}`)
  }, [entry, isDeleted, workspace])

  const handleRenameSubmit = useCallback((newName: string) => {
    renameEntry(entry.path, newName).catch(console.error)
    setRenamingPath(null)
  }, [entry.path, renameEntry, setRenamingPath])

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null)
  }, [setRenamingPath])

  // Handle new file/folder creation (special renaming state)
  const parentDirForNew = entry.isDir ? entry.path : ''
  const isNewFile = renamingPath === `__new_file__:${parentDirForNew}` && entry.isDir
  const isNewFolder = renamingPath === `__new_folder__:${parentDirForNew}` && entry.isDir

  const handleNewFileSubmit = useCallback((name: string) => {
    const parentDir = entry.isDir ? entry.path : ''
    createFile(parentDir, name).catch(console.error)
    setRenamingPath(null)
  }, [entry, createFile, setRenamingPath])

  const handleNewFolderSubmit = useCallback((name: string) => {
    const parentDir = entry.isDir ? entry.path : ''
    createDirectory(parentDir, name).catch(console.error)
    setRenamingPath(null)
  }, [entry, createDirectory, setRenamingPath])

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={handleRightClick}
        draggable={!isDeleted && !isRenaming}
        onDragStart={handleDragStart}
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-1.5 py-[3px] text-[12px] transition-colors select-none',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
          isSelected && 'bg-accent/80',
          isDeleted
            ? 'text-muted-foreground/40 cursor-default line-through decoration-muted-foreground/30'
            : 'text-foreground/80 hover:bg-accent/60',
          entry.isIgnored && 'opacity-50',
        )}
        style={{ paddingLeft: `${entry.depth * 12 + 6}px` }}
        aria-expanded={entry.isDir ? isExpanded : undefined}
        aria-disabled={isDeleted || undefined}
      >
        {entry.isDir ? (
          <>
            {isLoading ? (
              <div className="size-3 shrink-0 animate-spin rounded-full border border-primary/50 border-t-transparent" />
            ) : isExpanded ? (
              <IconChevronDown className="size-3 shrink-0 text-muted-foreground" />
            ) : (
              <IconChevronRight className="size-3 shrink-0 text-muted-foreground" />
            )}
            <FileTypeIcon name={entry.name} isDir isExpanded={isExpanded} className="size-3.5" />
          </>
        ) : (
          <>
            <span className="size-3 shrink-0" />
            <FileTypeIcon name={entry.name} isDir={false} className={cn('size-3.5', isDeleted && 'opacity-40')} />
          </>
        )}
        {isRenaming ? (
          <InlineRenameInput
            initialValue={entry.name}
            onSubmit={handleRenameSubmit}
            onCancel={handleRenameCancel}
          />
        ) : (
          <span className="min-w-0 truncate">{entry.name}</span>
        )}
        {entry.gitStatus && GIT_STATUS_COLORS[entry.gitStatus] && (
          <span className={cn('ml-auto size-1.5 shrink-0 rounded-full', GIT_STATUS_COLORS[entry.gitStatus])} title={entry.gitStatus} />
        )}
      </button>

      {/* New file input when creating inside this dir */}
      {isNewFile && isExpanded && (
        <div style={{ paddingLeft: `${(entry.depth + 1) * 12 + 6}px` }} className="flex items-center gap-1 px-1.5 py-[3px]">
          <span className="size-3 shrink-0" />
          <IconChevronRight className="size-3 shrink-0 text-transparent" />
          <InlineRenameInput initialValue="" onSubmit={handleNewFileSubmit} onCancel={handleRenameCancel} />
        </div>
      )}
      {isNewFolder && isExpanded && (
        <div style={{ paddingLeft: `${(entry.depth + 1) * 12 + 6}px` }} className="flex items-center gap-1 px-1.5 py-[3px]">
          <span className="size-3 shrink-0" />
          <IconChevronRight className="size-3 shrink-0 text-muted-foreground" />
          <InlineRenameInput initialValue="" onSubmit={handleNewFolderSubmit} onCancel={handleRenameCancel} />
        </div>
      )}

      {/* Render children if expanded */}
      {entry.isDir && isExpanded && visibleChildren.map((child) => (
        <TreeItem
          key={child.id}
          entry={child}
          workspace={workspace}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  )
})

// ── Main Panel ───────────────────────────────────────────────────────────────

interface FileTreePanelProps {
  onClose: () => void
  workspace?: string
}

export const FileTreePanel = memo(function FileTreePanel({ onClose, workspace: workspaceProp }: FileTreePanelProps) {
  const [width, setWidth] = useState(260)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: TreeEntry | null } | null>(null)

  const rootEntries = useFileTreeStore((s) => s.rootEntries)
  const loadingDirs = useFileTreeStore((s) => s.loadingDirs)
  const previewFile = useFileTreeStore((s) => s.previewFile)
  const showIgnored = useFileTreeStore((s) => s.showIgnored)
  const renamingPath = useFileTreeStore((s) => s.renamingPath)
  const loadRoot = useFileTreeStore((s) => s.loadRoot)
  const setPreviewFile = useFileTreeStore((s) => s.setPreviewFile)
  const setShowIgnored = useFileTreeStore((s) => s.setShowIgnored)
  const setRenamingPath = useFileTreeStore((s) => s.setRenamingPath)
  const createFile = useFileTreeStore((s) => s.createFile)
  const createDirectory = useFileTreeStore((s) => s.createDirectory)
  const collapseAll = useFileTreeStore((s) => s.collapseAll)
  const refresh = useFileTreeStore((s) => s.refresh)

  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const taskWorkspace = useTaskStore((s) => selectedTaskId ? (s.tasks[selectedTaskId]?.originalWorkspace ?? s.tasks[selectedTaskId]?.workspace) : undefined)
  const effectiveWorkspace = taskWorkspace ?? workspaceProp ?? ''

  // Load root on mount / workspace change
  useEffect(() => {
    if (effectiveWorkspace) {
      loadRoot(effectiveWorkspace)
      startTreeWatcher()
    }
    return () => {
      stopTreeWatcher()
    }
  }, [effectiveWorkspace, loadRoot])

  // Backend filters by gitignore based on `showIgnored`; only excluded
  // entries (e.g. workspace-level excludes) need renderer-side filtering.
  const visibleRootEntries = useMemo(() => {
    if (showIgnored) return rootEntries
    return rootEntries.filter((e) => !e.isExcluded)
  }, [rootEntries, showIgnored])

  const isRootLoading = loadingDirs.has('')

  const handleResizeStart = useResizeHandle({
    axis: 'horizontal', size: width, onResize: setWidth, min: 180, max: 500, reverse: true,
  })

  const handleRefresh = useCallback(() => {
    refresh()
  }, [refresh])

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: TreeEntry | null) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }, [])

  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, entry: null })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // Handle new file/folder at root level
  const isNewFileAtRoot = renamingPath === '__new_file__:'
  const isNewFolderAtRoot = renamingPath === '__new_folder__:'

  const handleNewFileAtRootSubmit = useCallback((name: string) => {
    createFile('', name).catch(console.error)
    setRenamingPath(null)
  }, [createFile, setRenamingPath])

  const handleNewFolderAtRootSubmit = useCallback((name: string) => {
    createDirectory('', name).catch(console.error)
    setRenamingPath(null)
  }, [createDirectory, setRenamingPath])

  const handleNewCancel = useCallback(() => {
    setRenamingPath(null)
  }, [setRenamingPath])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu) { setContextMenu(null); return }
        if (renamingPath) { setRenamingPath(null); return }
        if (previewFile) return // FilePreviewModal handles its own Esc
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu, renamingPath, previewFile, onClose, setRenamingPath])

  return (
    <>
      <div
        className="relative flex h-full w-full shrink-0 flex-col border-l border-border bg-background sm:ml-3 sm:w-[var(--panel-width)]"
        style={{ '--panel-width': `${width}px` } as CSSProperties}
      >
        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 z-10 hidden h-full w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 sm:block"
          onMouseDown={handleResizeStart}
        />
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border pl-3 pr-0 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Files</span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setRenamingPath('__new_file__:')}
                  className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <IconFilePlus className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New File</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setRenamingPath('__new_folder__:')}
                  className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <IconFolderPlus className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New Folder</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowIgnored(!showIgnored)}
                  className={cn(
                    'flex size-5 items-center justify-center rounded-md transition-colors',
                    showIgnored ? 'text-foreground bg-accent' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {showIgnored ? <IconEye className="size-3" /> : <IconEyeOff className="size-3" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{showIgnored ? 'Hide ignored' : 'Show ignored'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={collapseAll} className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  <IconFoldDown className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Collapse All</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={handleRefresh} className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  <IconRefresh className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Refresh</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={onClose} className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  <IconX className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {/* Tree content */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-1.5" onContextMenu={handleBackgroundContextMenu}>
            {isRootLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {!isRootLoading && visibleRootEntries.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">No files found</p>
            )}

            {/* New file/folder at root */}
            {isNewFileAtRoot && (
              <div className="flex items-center gap-1 px-1.5 py-[3px]" style={{ paddingLeft: '6px' }}>
                <span className="size-3 shrink-0" />
                <InlineRenameInput initialValue="" onSubmit={handleNewFileAtRootSubmit} onCancel={handleNewCancel} />
              </div>
            )}
            {isNewFolderAtRoot && (
              <div className="flex items-center gap-1 px-1.5 py-[3px]" style={{ paddingLeft: '6px' }}>
                <IconChevronRight className="size-3 shrink-0 text-muted-foreground" />
                <InlineRenameInput initialValue="" onSubmit={handleNewFolderAtRootSubmit} onCancel={handleNewCancel} />
              </div>
            )}

            {!isRootLoading && visibleRootEntries.map((entry) => (
              <TreeItem
                key={entry.id}
                entry={entry}
                workspace={effectiveWorkspace}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <TreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          workspace={effectiveWorkspace}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal filePath={`${effectiveWorkspace}/${previewFile}`} onClose={() => setPreviewFile(null)} />
      )}
    </>
  )
})

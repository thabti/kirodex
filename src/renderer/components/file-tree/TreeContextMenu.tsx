import { memo, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFileTreeStore, type TreeEntry } from '@/stores/fileTreeStore'
import { useTaskStore } from '@/stores/taskStore'
import type { ProjectFile } from '@/types'
import {
  IconFile, IconFolder, IconTrash, IconCopy,
  IconPencil, IconExternalLink, IconTerminal, IconSearch,
  IconGitBranch, IconAt,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface ContextMenuProps {
  x: number
  y: number
  entry: TreeEntry | null  // null = background (root level)
  workspace: string
  onClose: () => void
}

interface MenuItem {
  label: string
  icon?: React.ReactNode
  shortcut?: string
  action: () => void
  separator?: boolean
  disabled?: boolean
  danger?: boolean
}

export const TreeContextMenu = memo(function TreeContextMenu({
  x, y, entry, workspace, onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const store = useFileTreeStore

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right > vw) {
      ref.current.style.left = `${x - rect.width}px`
    }
    if (rect.bottom > vh) {
      ref.current.style.top = `${y - rect.height}px`
    }
  }, [x, y])

  const handleNewFile = useCallback(() => {
    const parentDir = entry?.isDir ? entry.path : (entry?.path.split('/').slice(0, -1).join('/') ?? '')
    if (entry?.isDir && !useFileTreeStore.getState().expandedDirs.has(entry.path)) {
      useFileTreeStore.getState().expandDir(entry.path).then(() => {
        store.getState().setRenamingPath(`__new_file__:${parentDir}`)
      })
    } else {
      store.getState().setRenamingPath(`__new_file__:${parentDir}`)
    }
    onClose()
  }, [entry, onClose])

  const handleNewFolder = useCallback(() => {
    const parentDir = entry?.isDir ? entry.path : (entry?.path.split('/').slice(0, -1).join('/') ?? '')
    if (entry?.isDir && !useFileTreeStore.getState().expandedDirs.has(entry.path)) {
      useFileTreeStore.getState().expandDir(entry.path).then(() => {
        store.getState().setRenamingPath(`__new_folder__:${parentDir}`)
      })
    } else {
      store.getState().setRenamingPath(`__new_folder__:${parentDir}`)
    }
    onClose()
  }, [entry, onClose])

  const handleReveal = useCallback(() => {
    if (!entry) return
    invoke('reveal_in_finder', { workspace, relPath: entry.path }).catch(console.error)
    onClose()
  }, [entry, workspace, onClose])

  const handleOpenTerminal = useCallback(() => {
    // Resolve the absolute folder path: a directory entry uses its own path;
    // a file entry opens the terminal in its parent directory.
    const relPath = entry?.path ?? ''
    const absPath = relPath ? `${workspace}/${relPath}` : workspace
    const isFile = entry && !entry.isDir
    const cwd = isFile
      ? absPath.split('/').slice(0, -1).join('/') || workspace
      : absPath

    // Route to the in-app terminal drawer for the currently focused panel.
    // Falls back to the workspace-level drawer (PendingChat) when no task
    // is open, mirroring how the toolbar terminal toggle picks its slot.
    const taskState = useTaskStore.getState()
    const slotId = taskState.selectedTaskId ?? '__workspace__'
    taskState.requestOpenTerminalAt(slotId, cwd)
    onClose()
  }, [entry, workspace, onClose])

  const handleMentionInChat = useCallback(() => {
    if (!entry) return
    const dir = entry.path.split('/').slice(0, -1).join('/')
    const file: ProjectFile = {
      path: entry.path,
      name: entry.name,
      dir,
      isDir: entry.isDir,
      ext: entry.ext,
      modifiedAt: entry.modifiedAt,
      gitStatus: entry.gitStatus,
    }
    const existing = useTaskStore.getState().draftMentionedFiles[workspace] ?? []
    if (!existing.some((f) => f.path === file.path)) {
      useTaskStore.getState().setDraftMentionedFiles(workspace, [...existing, file])
    }
    onClose()
  }, [entry, workspace, onClose])

  const handleCopyPath = useCallback(() => {
    if (!entry) return
    const absolutePath = `${workspace}/${entry.path}`
    navigator.clipboard.writeText(absolutePath).catch((err) => {
      console.error('Failed to copy path:', err)
    })
    onClose()
  }, [entry, workspace, onClose])

  const handleCopyRelPath = useCallback(() => {
    if (!entry) return
    navigator.clipboard.writeText(entry.path).catch((err) => {
      console.error('Failed to copy relative path:', err)
    })
    onClose()
  }, [entry, workspace, onClose])

  const handleAddToGitignore = useCallback(() => {
    if (!entry) return
    invoke('add_to_gitignore', { workspace, relPath: entry.path }).catch(console.error)
    onClose()
  }, [entry, workspace, onClose])

  const handleRename = useCallback(() => {
    if (!entry) return
    store.getState().setRenamingPath(entry.path)
    onClose()
  }, [entry, onClose])

  const handleTrash = useCallback(() => {
    if (!entry) return
    store.getState().deleteEntry(entry.path, false).catch(console.error)
    onClose()
  }, [entry, onClose])

  // Build menu items
  const items: MenuItem[] = []

  // New file/folder (always available)
  items.push({ label: 'New File', icon: <IconFile className="size-3.5" />, shortcut: '⌘N', action: handleNewFile })
  items.push({ label: 'New Folder', icon: <IconFolder className="size-3.5" />, shortcut: '⇧⌘N', action: handleNewFolder, separator: true })

  if (entry) {
    // Reveal / Open
    items.push({ label: 'Reveal in Finder', icon: <IconExternalLink className="size-3.5" />, shortcut: '⌥⌘R', action: handleReveal })
    items.push({ label: 'Open in Terminal', icon: <IconTerminal className="size-3.5" />, action: handleOpenTerminal, separator: true })

    // Find in folder (for directories)
    if (entry.isDir) {
      items.push({ label: 'Find in Folder...', icon: <IconSearch className="size-3.5" />, shortcut: '⌥⌘⇧F', action: () => {
        const absPath = `${workspace}/${entry.path}`
        invoke('open_finder_search', { path: absPath }).catch(() => {
          invoke('reveal_in_finder', { workspace, relPath: entry.path }).catch(console.error)
        })
        onClose()
      }, separator: true })
    }

    // Mention in Chat
    items.push({ label: 'Mention in Chat', icon: <IconAt className="size-3.5" />, action: handleMentionInChat, separator: true })

    // Copy path
    items.push({ label: 'Copy Path', icon: <IconCopy className="size-3.5" />, shortcut: '⌥⌘C', action: handleCopyPath })
    items.push({ label: 'Copy Relative Path', icon: <IconCopy className="size-3.5" />, shortcut: '⌥⇧⌘C', action: handleCopyRelPath, separator: true })

    // Gitignore
    items.push({ label: 'Add to .gitignore', icon: <IconGitBranch className="size-3.5" />, action: handleAddToGitignore, separator: true })

    // Rename / Trash
    items.push({ label: 'Rename', icon: <IconPencil className="size-3.5" />, shortcut: 'F2', action: handleRename })
    items.push({ label: 'Trash', icon: <IconTrash className="size-3.5" />, action: handleTrash })
  } else {
    // Background context menu
    items.push({ label: 'Open in Terminal', icon: <IconTerminal className="size-3.5" />, action: handleOpenTerminal })
  }

  return (
    <div
      ref={ref}
      className="fixed z-[200] min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-95"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={i}>
          <button
            type="button"
            disabled={item.disabled}
            onClick={item.action}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
              item.disabled
                ? 'text-muted-foreground/40 cursor-default'
                : item.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-foreground/80 hover:bg-accent/60',
            )}
          >
            {item.icon && <span className="shrink-0 text-muted-foreground">{item.icon}</span>}
            <span className="flex-1 text-left">{item.label}</span>
            {item.shortcut && (
              <span className="ml-4 text-[10px] text-muted-foreground/60">{item.shortcut}</span>
            )}
          </button>
          {item.separator && <div className="my-1 h-px bg-border/50" />}
        </div>
      ))}
    </div>
  )
})

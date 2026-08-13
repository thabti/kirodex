import { useState, useCallback, useEffect, useRef, type RefObject } from 'react'
import { ipc } from '@/lib/ipc'
import { isTauriRuntime } from '@/lib/web-rpc'
import { processDroppedFile, processNativePath } from '@/components/chat/attachment-utils'
import type { Attachment, ProjectFile } from '@/types'

type InAppDragData = { type: 'file'; data: ProjectFile } | { type: 'folder'; path: string }

/**
 * Module-level mutable state for cross-component drag communication.
 *
 * NOTE: This intentionally uses module-level variables instead of useRef.
 * The FileTreePanel (producer) sets drag data on dragstart, and the chat input's
 * useAttachments hook (consumer) reads it on drop. Since these are different
 * component instances, a useRef scoped to either component wouldn't work.
 * The lifecycle is tied to a single drag operation, not a component mount cycle.
 *
 * On macOS WebKit, Tauri's native drag-drop handler intercepts ALL drag events
 * at the OS level, preventing HTML5 dragenter/dragover/drop from reaching the DOM.
 * Only Tauri's onDragDropEvent fires. We store drag data here during dragstart
 * and consume it when Tauri fires the drop event with empty paths.
 */
let inAppDragActive = false
let inAppDragData: InAppDragData | null = null

/**
 * Tracks whether a Tauri drop with empty paths was already handled.
 * Prevents dragend from double-processing after Tauri's drop handler consumed the data.
 */
let inAppDropHandled = false

export function setInAppDragActive(active: boolean) {
  inAppDragActive = active
  if (!active) {
    // Don't clear inAppDragData here — Tauri's drop event fires AFTER dragend
    // on macOS. We clear it after a short delay to give the Tauri handler time.
  }
}

export function setInAppDragData(data: InAppDragData | null) {
  inAppDragData = data
  if (data) {
    inAppDropHandled = false
  }
}

function consumeInAppDragData(): InAppDragData | null {
  const data = inAppDragData
  inAppDragData = null
  inAppDragActive = false
  inAppDropHandled = true
  return data
}

export function useAttachments(initialAttachments?: Attachment[], initialFolderPaths?: string[], isActive = true, containerRef?: RefObject<HTMLElement | null>) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments ?? [])
  const [folderPaths, setFolderPaths] = useState<string[]>(initialFolderPaths ?? [])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [droppedFiles, setDroppedFiles] = useState<ProjectFile[]>([])

  const addAttachments = useCallback(async (files: File[]) => {
    const results = await Promise.all(files.map(processDroppedFile))
    const valid = results.filter((a): a is Attachment => a !== null)
    if (valid.length > 0) setAttachments((prev) => [...prev, ...valid])
  }, [])

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter((item) => item.type.startsWith('image/'))
    if (imageItems.length === 0) return
    e.preventDefault()
    const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null)
    if (files.length > 0) addAttachments(files)
  }, [addAttachments])

  const handleFilePickerClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) addAttachments(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [addAttachments])

  const clearAttachments = useCallback(() => {
    setAttachments([])
    setFolderPaths([])
    setDroppedFiles([])
  }, [])

  const handleRemoveFolder = useCallback((path: string) => {
    setFolderPaths((prev) => prev.filter((p) => p !== path))
  }, [])

  // Tauri native drag-drop listener — the ONLY reliable drag event source on macOS.
  // HTML5 drag events (dragenter, dragover, drop) never fire because Tauri's native
  // WebKit handler intercepts them at the OS level.
  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    const unlistenPromise = import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
      const appWindow = getCurrentWebviewWindow()
      return appWindow.onDragDropEvent(async (event) => {
      if (cancelled) return
      if (!isActive) {
        setIsDragOver(false)
        return
      }

      if (event.payload.type === 'over' || event.payload.type === 'enter') {
        setIsDragOver(true)
      } else if (event.payload.type === 'drop') {
        setIsDragOver(false)
        const paths = event.payload.paths ?? []

        // In-app drag: paths is empty but we have stored drag data.
        // On macOS, dragend fires BEFORE this handler, so inAppDragActive may
        // already be false — but inAppDragData persists until consumed.
        if (paths.length === 0 && inAppDragData) {
          const data = consumeInAppDragData()
          if (data) {
            if (data.type === 'folder') {
              setFolderPaths((prev) => {
                const existing = new Set(prev)
                return existing.has(data.path) ? prev : [...prev, data.path]
              })
            } else {
              const file = data.data
              setDroppedFiles((prev) => {
                if (prev.some((f) => f.path === file.path)) return prev
                return [...prev, file]
              })
            }
          }
          return
        }

        // Native file drop from Finder — paths has actual file paths
        if (paths.length === 0) return

        const dirChecks = await Promise.all(paths.map(async (p) => ({ path: p, isDir: await ipc.isDirectory(p).catch(() => false) })))
        const folders = dirChecks.filter((d) => d.isDir).map((d) => d.path)
        const files = dirChecks.filter((d) => !d.isDir).map((d) => d.path)
        if (folders.length > 0 && !cancelled) {
          setFolderPaths((prev) => {
            const existing = new Set(prev)
            const newFolders = folders.filter((f) => !existing.has(f))
            return newFolders.length > 0 ? [...prev, ...newFolders] : prev
          })
        }
        if (files.length > 0) {
          const results = await Promise.all(files.map((p) => processNativePath(p)))
          const valid = results.filter((a): a is Attachment => a !== null)
          if (valid.length > 0 && !cancelled) setAttachments((prev) => [...prev, ...valid])
        }
      } else {
        // 'leave' or 'cancel'
        setIsDragOver(false)
      }
      })
    })
    return () => {
      cancelled = true
      unlistenPromise.then((fn) => fn()).catch(() => {})
    }
  }, [isActive])

  // HTML5 drag event listeners — these work on platforms where Tauri doesn't
  // intercept (e.g., Linux/Windows), and serve as a fallback.
  useEffect(() => {
    if (!isActive) return
    const el = containerRef?.current
    if (!el) return

    const handleDragOver = (e: Event) => {
      const de = e as DragEvent
      if (inAppDragActive || de.dataTransfer?.types.some((t) => t.startsWith('application/x-kirodex'))) {
        de.preventDefault()
        if (de.dataTransfer) de.dataTransfer.dropEffect = 'copy'
        setIsDragOver(true)
      }
    }
    const handleDragEnter = (e: Event) => {
      const de = e as DragEvent
      if (inAppDragActive || de.dataTransfer?.types.some((t) => t.startsWith('application/x-kirodex'))) {
        setIsDragOver(true)
      }
    }
    const handleDragLeave = (e: Event) => {
      const de = e as DragEvent
      if (containerRef?.current && de.relatedTarget && containerRef.current.contains(de.relatedTarget as Node)) return
      if (inAppDragActive || de.dataTransfer?.types.some((t) => t.startsWith('application/x-kirodex'))) {
        setIsDragOver(false)
      }
    }
    const handleDrop = (e: Event) => {
      const de = e as DragEvent
      de.preventDefault()
      setIsDragOver(false)

      // Try HTML5 dataTransfer first (works on Linux/Windows)
      const dt = de.dataTransfer
      let folderData = dt?.getData('application/x-kirodex-folder') ?? ''
      let fileData = dt?.getData('application/x-kirodex-file') ?? ''

      // Fallback to module-level drag data
      if (!folderData && !fileData && inAppDragData) {
        const data = consumeInAppDragData()
        if (data) {
          if (data.type === 'folder') folderData = data.path
          else fileData = JSON.stringify(data.data)
        }
      }

      if (!folderData && !fileData) return
      if (folderData) {
        setFolderPaths((prev) => {
          const existing = new Set(prev)
          return existing.has(folderData) ? prev : [...prev, folderData]
        })
      }
      if (fileData) {
        try {
          const file = JSON.parse(fileData) as ProjectFile
          setDroppedFiles((prev) => {
            if (prev.some((f) => f.path === file.path)) return prev
            return [...prev, file]
          })
        } catch { /* invalid data */ }
      }
    }

    // dragend cleanup — clear stale state if neither Tauri nor HTML5 handled the drop
    const handleDragEnd = () => {
      setIsDragOver(false)
      // Give Tauri's drop handler time to fire (it arrives ~2ms after dragend on macOS)
      setTimeout(() => {
        if (!inAppDropHandled && inAppDragData) {
          // Drop happened outside any valid target — clear stale data
          inAppDragData = null
        }
        inAppDragActive = false
        inAppDropHandled = false
      }, 50)
    }

    el.addEventListener('dragenter', handleDragEnter)
    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop)
    document.addEventListener('dragend', handleDragEnd)
    return () => {
      el.removeEventListener('dragenter', handleDragEnter)
      el.removeEventListener('dragover', handleDragOver)
      el.removeEventListener('dragleave', handleDragLeave)
      el.removeEventListener('drop', handleDrop)
      document.removeEventListener('dragend', handleDragEnd)
    }
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps -- containerRef is a stable ref object; re-running on ref identity change is unnecessary

  return {
    attachments,
    folderPaths,
    isDragOver,
    fileInputRef,
    droppedFiles,
    handleRemoveAttachment,
    handleRemoveFolder,
    handlePaste,
    handleFilePickerClick,
    handleFileInputChange,
    clearAttachments,
  } as const
}

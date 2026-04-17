import { useState, useMemo, useCallback, useEffect } from 'react'
import { parsePatchFiles } from '@pierre/diffs'
import { FileDiff, Virtualizer } from '@pierre/diffs/react'
import { ipc } from '@/lib/ipc'
import { useDiffStore } from '@/stores/diffStore'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { getPreferredEditor } from '@/components/OpenInEditorGroup'
import { UNSAFE_CSS, getFileStats } from './diff-viewer-utils'
import { DiffToolbar } from './DiffToolbar'
import { DiffFileActionBar } from './DiffFileActionBar'
import { DiffFileSidebar } from './DiffFileSidebar'

interface DiffViewerProps {
  diff: string
  taskId?: string
  workspace?: string
  onRefreshDiff?: () => void
}

export function DiffViewer({ diff, taskId, workspace, onRefreshDiff }: DiffViewerProps) {
  const [diffStyle, setDiffStyle] = useState<'unified' | 'split'>('unified')
  const [wordWrap, setWordWrap] = useState(true)
  const [selectedFileIdx, setSelectedFileIdx] = useState<number | null>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set())
  const [revertIdx, setRevertIdx] = useState<number | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(176)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const [stagedFileCount, setStagedFileCount] = useState(0)

  useEffect(() => {
    if (!workspace) return
    ipc.gitStagedStats(workspace).then((s) => setStagedFileCount(s.fileCount)).catch(() => {})
  }, [workspace, diff])

  const handleSidebarDragStart = useResizeHandle({
    axis: 'horizontal', size: sidebarWidth, onResize: (w) => {
      if (w < 60) { setIsSidebarCollapsed(true) } else { setIsSidebarCollapsed(false); setSidebarWidth(w) }
    }, min: 0, max: 320,
  })

  const parsedFiles = useMemo(() => {
    if (!diff.trim()) return []
    try { return parsePatchFiles(diff).flatMap((p) => p.files) }
    catch { return [] }
  }, [diff])

  const fileStats = useMemo(() => getFileStats(parsedFiles), [parsedFiles])
  const totalAdditions = useMemo(() => fileStats.reduce((s, f) => s + f.additions, 0), [fileStats])
  const totalDeletions = useMemo(() => fileStats.reduce((s, f) => s + f.deletions, 0), [fileStats])

  const focusFile = useDiffStore((s) => s.focusFile)
  useEffect(() => {
    if (!focusFile || parsedFiles.length === 0) return
    const idx = parsedFiles.findIndex((f) => f.name.replace(/^[ab]\//, '').includes(focusFile))
    if (idx >= 0) { setSelectedFileIdx(idx); useDiffStore.setState({ focusFile: null }) }
  }, [focusFile, parsedFiles])

  const visibleIndices = useMemo(() => {
    if (selectedFileIdx !== null && parsedFiles[selectedFileIdx]) return [selectedFileIdx]
    return parsedFiles.map((_, i) => i)
  }, [parsedFiles, selectedFileIdx])

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const toggleCollapse = useCallback((idx: number) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }, [])

  const handleStage = useCallback(async (filePath: string) => {
    if (!taskId) return
    try { await ipc.gitStage(taskId, filePath); onRefreshDiff?.() }
    catch (e) { console.error('Stage failed:', e) }
  }, [taskId, onRefreshDiff])

  const handleRevert = useCallback(async (filePath: string) => {
    if (!taskId) return
    try { await ipc.gitRevert(taskId, filePath); setRevertIdx(null); onRefreshDiff?.() }
    catch (e) { console.error('Revert failed:', e) }
  }, [taskId, onRefreshDiff])

  const handleOpenInEditor = useCallback((filePath: string) => {
    if (!workspace) return
    ipc.openInEditor(`${workspace}/${filePath}`, getPreferredEditor()).catch(() => {})
  }, [workspace])

  if (!diff.trim() || parsedFiles.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">No changes yet</div>
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <DiffToolbar
        fileCount={parsedFiles.length}
        totalAdditions={totalAdditions}
        totalDeletions={totalDeletions}
        stagedFileCount={stagedFileCount}
        diffStyle={diffStyle}
        wordWrap={wordWrap}
        isSidebarCollapsed={isSidebarCollapsed}
        onDiffStyleChange={setDiffStyle}
        onWordWrapToggle={() => setWordWrap((v) => !v)}
        onSidebarToggle={() => setIsSidebarCollapsed((v) => !v)}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!isSidebarCollapsed && (
          <DiffFileSidebar
            fileStats={fileStats}
            selectedFileIdx={selectedFileIdx}
            sidebarWidth={sidebarWidth}
            onSelectFile={setSelectedFileIdx}
            onDragStart={handleSidebarDragStart}
          />
        )}
        <div className="flex-1 min-w-0 overflow-auto">
          <Virtualizer config={{ overscrollSize: 400, intersectionObserverMargin: 800 }}>
            {visibleIndices.map((fileIdx) => {
              const fileDiff = parsedFiles[fileIdx]
              const stats = fileStats[fileIdx]
              if (!fileDiff || !stats) return null
              const isCollapsed = collapsedFiles.has(fileIdx)
              return (
                <div key={`${fileDiff.name}-${fileIdx}`}>
                  <DiffFileActionBar
                    name={stats.name}
                    additions={stats.additions}
                    deletions={stats.deletions}
                    collapsed={isCollapsed}
                    onToggleCollapse={() => toggleCollapse(fileIdx)}
                    onStage={() => handleStage(stats.name)}
                    onRevert={() => setRevertIdx(fileIdx)}
                    onOpenInEditor={() => handleOpenInEditor(stats.name)}
                    revertPending={revertIdx === fileIdx}
                    onConfirmRevert={() => void handleRevert(stats.name)}
                    onCancelRevert={() => setRevertIdx(null)}
                  />
                  {!isCollapsed && (
                    <FileDiff
                      fileDiff={fileDiff}
                      options={{
                        diffStyle,
                        lineDiffType: 'word',
                        overflow: wordWrap ? 'wrap' : 'scroll',
                        theme: isDark ? 'pierre-dark' : 'pierre-light',
                        themeType: isDark ? 'dark' : 'light',
                        unsafeCSS: UNSAFE_CSS,
                      }}
                    />
                  )}
                </div>
              )
            })}
          </Virtualizer>
        </div>
      </div>
    </div>
  )
}

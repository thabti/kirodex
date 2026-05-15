import { useState, useEffect, useCallback, useMemo } from 'react'
import { IconLoader2, IconSparkles, IconGitBranch, IconArrowUp } from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { ipc } from '@/lib/ipc'
import { track } from '@/lib/analytics'
import { useSettingsStore } from '@/stores/settingsStore'
import { cn } from '@/lib/utils'
import { withStackedGitToast } from '@/lib/git-toast'

interface ChangedFile {
  path: string
  insertions: number
  deletions: number
  status: string
}

interface CommitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace: string
}

const DEFAULT_BRANCHES = ['main', 'master', 'develop', 'dev']

export function CommitDialog({ open, onOpenChange, workspace }: CommitDialogProps) {
  const [commitMsg, setCommitMsg] = useState('')
  const [files, setFiles] = useState<ChangedFile[]>([])
  const [excludedFiles, setExcludedFiles] = useState<Set<string>>(new Set())
  const [isEditingFiles, setIsEditingFiles] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [branch, setBranch] = useState<string | null>(null)
  const [newBranchName, setNewBranchName] = useState('')
  const [showNewBranchInput, setShowNewBranchInput] = useState(false)
  const aiCommitMessages = useSettingsStore((s) => s.settings.aiCommitMessages ?? true)

  const isDefaultBranch = branch ? DEFAULT_BRANCHES.includes(branch) : false

  // Fetch changed files and branch when dialog opens
  useEffect(() => {
    if (!open) return
    setIsLoading(true)

    // Fetch independently so one failure doesn't blank out the other
    const filesPromise = ipc.gitChangedFiles(workspace)
      .then((changedFiles) => setFiles(changedFiles))
      .catch((e) => {
        console.error('[CommitDialog] Failed to fetch changed files:', e)
        setFiles([])
      })

    const statusPromise = ipc.gitVcsStatus(workspace)
      .then((status) => setBranch(status.branch || null))
      .catch((e) => {
        console.error('[CommitDialog] Failed to fetch VCS status:', e)
        setBranch(null)
      })

    Promise.all([filesPromise, statusPromise]).finally(() => setIsLoading(false))
  }, [open, workspace])

  const selectedFiles = useMemo(
    () => files.filter((f) => !excludedFiles.has(f.path)),
    [files, excludedFiles],
  )

  const allSelected = excludedFiles.size === 0
  const noneSelected = selectedFiles.length === 0

  const totalInsertions = useMemo(
    () => selectedFiles.reduce((sum, f) => sum + (f.insertions ?? 0), 0),
    [selectedFiles],
  )
  const totalDeletions = useMemo(
    () => selectedFiles.reduce((sum, f) => sum + (f.deletions ?? 0), 0),
    [selectedFiles],
  )

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      const result = await ipc.gitGenerateCommitMessage(workspace)
      const next = result.body.trim().length > 0
        ? `${result.subject}\n\n${result.body}`
        : result.subject
      setCommitMsg(next)
      track('feature_used', { feature: 'git', detail: 'commit_message_generated' })
    } catch (e) {
      toast.error('Could not generate commit message', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setIsGenerating(false)
    }
  }, [isGenerating, workspace])

  const doCommit = useCallback(async (targetBranch?: string) => {
    if (noneSelected) return
    setIsCommitting(true)
    try {
      // If committing on a new branch, create and checkout first
      if (targetBranch) {
        await ipc.gitCreateAndCheckoutBranch(workspace, targetBranch)
        toast.success('Branch created', {
          description: `Switched to ${targetBranch}`,
        })
      }

      const filePaths = selectedFiles.map((f) => f.path)
      const message = commitMsg.trim() || undefined

      if (message) {
        await ipc.gitCommitFiles(workspace, message, filePaths)
      } else {
        // Stage the selected files first so the AI generates a message
        // that matches exactly what will be committed (not the full worktree diff).
        await ipc.gitStageFiles(workspace, filePaths)
        const generated = await ipc.gitGenerateCommitMessage(workspace)
        const autoMsg = generated.body.trim().length > 0
          ? `${generated.subject}\n\n${generated.body}`
          : generated.subject
        await ipc.gitCommitFiles(workspace, autoMsg, filePaths)
      }

      toast.success('Changes committed', {
        description: `${filePaths.length} file${filePaths.length > 1 ? 's' : ''} committed${targetBranch ? ` on ${targetBranch}` : ''}`,
      })
      track('feature_used', { feature: 'git', detail: targetBranch ? 'commit_new_branch' : 'commit' })

      // Reset and close
      setCommitMsg('')
      setExcludedFiles(new Set())
      setIsEditingFiles(false)
      setShowNewBranchInput(false)
      setNewBranchName('')
      onOpenChange(false)
    } catch (e) {
      toast.error('Commit failed', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setIsCommitting(false)
    }
  }, [noneSelected, selectedFiles, commitMsg, workspace, onOpenChange])

  const handleCommit = useCallback(() => void doCommit(), [doCommit])

  const handleCommitAndPush = useCallback(async () => {
    if (noneSelected) return
    setIsCommitting(true)
    try {
      const filePaths = selectedFiles.map((f) => f.path)
      const message = commitMsg.trim() || undefined

      let finalMsg: string
      if (message) {
        finalMsg = message
      } else {
        // Stage the selected files first so the AI generates a message
        // that matches exactly what will be committed.
        await ipc.gitStageFiles(workspace, filePaths)
        const generated = await ipc.gitGenerateCommitMessage(workspace)
        finalMsg = generated.body.trim().length > 0
          ? `${generated.subject}\n\n${generated.body}`
          : generated.subject
      }

      // Reset and close immediately for better UX
      setCommitMsg('')
      setExcludedFiles(new Set())
      setIsEditingFiles(false)
      setShowNewBranchInput(false)
      setNewBranchName('')
      onOpenChange(false)

      // Run stacked action with progress toast
      await withStackedGitToast([
        { label: 'Commit', action: () => ipc.gitCommitFiles(workspace, finalMsg, filePaths) },
        { label: 'Push', action: () => ipc.gitPush(workspace) },
      ])
      track('feature_used', { feature: 'git', detail: 'commit_push' })
    } catch (e) {
      toast.error('Commit & Push failed', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setIsCommitting(false)
    }
  }, [noneSelected, selectedFiles, commitMsg, workspace, onOpenChange])

  const handleCommitOnNewBranch = useCallback(() => {
    if (showNewBranchInput && newBranchName.trim()) {
      void doCommit(newBranchName.trim())
    } else {
      setShowNewBranchInput(true)
    }
  }, [showNewBranchInput, newBranchName, doCommit])

  const handleClose = useCallback(() => {
    setCommitMsg('')
    setExcludedFiles(new Set())
    setIsEditingFiles(false)
    setShowNewBranchInput(false)
    setNewBranchName('')
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
          <DialogDescription>
            Review and confirm your commit. Leave the message blank to auto-generate one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2 overflow-y-auto">
          {/* Branch + Files info card */}
          <div className="space-y-3 rounded-lg border border-input bg-muted/40 p-3 text-xs">
            {/* Branch row */}
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
              <span className="text-muted-foreground">Branch</span>
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{branch ?? '(detached HEAD)'}</span>
                {isDefaultBranch && (
                  <span className="text-right text-xs text-orange-400">
                    Warning: default refName
                  </span>
                )}
              </span>
            </div>

            {/* Files section */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isEditingFiles && files.length > 0 && (
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => {
                        setExcludedFiles(
                          allSelected ? new Set(files.map((f) => f.path)) : new Set(),
                        )
                      }}
                    />
                  )}
                  <span className="text-muted-foreground">Files</span>
                  {!allSelected && !isEditingFiles && (
                    <span className="text-muted-foreground">
                      ({selectedFiles.length} of {files.length})
                    </span>
                  )}
                </div>
                {files.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsEditingFiles((v) => !v)}
                    className="rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    {isEditingFiles ? 'Done' : 'Edit'}
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                  <IconLoader2 className="size-4 animate-spin" />
                  <span>Loading files…</span>
                </div>
              ) : files.length === 0 ? (
                <p className="font-medium text-muted-foreground py-2">No changes</p>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-44 overflow-y-auto rounded-md border border-input bg-background">
                    <div className="space-y-0.5 p-1">
                      {files.map((file) => {
                        const isExcluded = excludedFiles.has(file.path)
                        return (
                          <div
                            key={file.path}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1 font-mono text-xs transition-colors hover:bg-accent/50"
                          >
                            {isEditingFiles && (
                              <Checkbox
                                checked={!isExcluded}
                                onCheckedChange={() => {
                                  setExcludedFiles((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(file.path)) {
                                      next.delete(file.path)
                                    } else {
                                      next.add(file.path)
                                    }
                                    return next
                                  })
                                }}
                              />
                            )}
                            <span className={cn(
                              'flex-1 truncate',
                              isExcluded && 'text-muted-foreground',
                            )}>
                              {file.path}
                            </span>
                            <span className="shrink-0">
                              {isExcluded ? (
                                <span className="text-muted-foreground">Excluded</span>
                              ) : (
                                <>
                                  <span className="text-emerald-600 dark:text-emerald-400">+{file.insertions}</span>
                                  <span className="text-muted-foreground"> / </span>
                                  <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
                                </>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {/* Total stats */}
                  <div className="flex justify-end font-mono text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">+{totalInsertions}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-red-600 dark:text-red-400">-{totalDeletions}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Commit message */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Commit message (optional)</p>
              {aiCommitMessages && (
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={isGenerating || isCommitting}
                  className="flex items-center gap-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {isGenerating
                    ? <IconLoader2 className="size-3 animate-spin" />
                    : <IconSparkles className="size-3" />}
                  Generate
                </button>
              )}
            </div>
            <textarea
              autoFocus
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleCommit()
                }
              }}
              placeholder="Leave empty to auto-generate"
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring placeholder:text-muted-foreground/60"
            />
          </div>

          {/* New branch input (shown when "Commit on new refName" is clicked) */}
          {showNewBranchInput && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <IconGitBranch className="size-3" />
                New branch name
              </p>
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newBranchName.trim()) {
                    e.preventDefault()
                    handleCommitOnNewBranch()
                  }
                }}
                placeholder="feature/my-changes"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring placeholder:text-muted-foreground/60"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={noneSelected || isCommitting}
            onClick={handleCommitOnNewBranch}
            className="whitespace-nowrap"
          >
            {showNewBranchInput ? 'Confirm new branch' : 'Commit on new refName'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={noneSelected || isCommitting}
            onClick={() => void handleCommitAndPush()}
            className="whitespace-nowrap"
          >
            <IconArrowUp className="size-3" />
            Commit & Push
          </Button>
          <Button
            size="sm"
            disabled={noneSelected || isCommitting}
            onClick={handleCommit}
          >
            {isCommitting ? (
              <><IconLoader2 className="size-3.5 animate-spin mr-1" /> Committing…</>
            ) : (
              'Commit'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

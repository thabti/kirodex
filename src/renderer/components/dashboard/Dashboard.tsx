import { memo, useCallback, useMemo } from 'react'
import { IconRobot, IconPlus, IconFolderOpen } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { TaskCard } from './TaskCard'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  pending_permission: 1,
  paused: 2,
  error: 3,
  completed: 4,
  cancelled: 5,
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STATUS_DOT: Record<string, string> = {
  running: 'bg-success',
  paused: 'bg-warning',
  completed: 'bg-primary',
  error: 'bg-destructive',
  cancelled: 'bg-muted-foreground',
  pending_permission: 'bg-warning',
}

export const Dashboard = memo(function Dashboard() {
  const tasks = useTaskStore((s) => s.tasks)
  const activityFeed = useTaskStore((s) => s.activityFeed)
  const setNewProjectOpen = useTaskStore((s) => s.setNewProjectOpen)

  const sorted = useMemo(() => {
    const arr = Object.values(tasks)
    return arr.sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 9
      const sb = STATUS_ORDER[b.status] ?? 9
      if (sa !== sb) return sa - sb
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [tasks])

  const taskCount = sorted.length
  const addProject = useTaskStore((s) => s.addProject)
  const createDraftThread = useTaskStore((s) => s.createDraftThread)

  const openNewTask = useCallback(() => setNewProjectOpen(true), [setNewProjectOpen])

  /** Pick a folder → add as project → create a draft thread → open chat */
  const handleNewThread = useCallback(async () => {
    const folder = await ipc.pickFolder()
    if (!folder) return
    addProject(folder)
    createDraftThread(folder)
  }, [addProject, createDraftThread])

  return (
    <div data-testid="dashboard-section" className="flex min-h-0 flex-1 overflow-hidden">
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <h1 data-testid="dashboard-heading" className="text-lg font-semibold">Dashboard</h1>
            <Badge variant="secondary" className="text-[10px]">
              {taskCount} task{taskCount !== 1 ? 's' : ''}
            </Badge>
            <Button size="sm" className="ml-auto gap-1.5" onClick={handleNewThread} data-testid="dashboard-new-thread-button">
              <IconPlus className="h-3.5 w-3.5" />
              New Thread
            </Button>
          </div>

          {taskCount === 0 ? (
            <Empty>
              <EmptyHeader>
                <IconRobot className="mb-4 h-10 w-10 text-muted-foreground/40" />
                <EmptyTitle>No threads yet</EmptyTitle>
                <EmptyDescription>
                  Import a project folder to start a new thread with Kiro.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={handleNewThread} className="gap-1.5">
                  <IconFolderOpen className="h-4 w-4" />
                  New thread
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div
              data-testid="dashboard-task-grid"
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
            >
              {sorted.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {activityFeed.length > 0 && (
        <>
          <Separator orientation="vertical" />
          <div className="flex w-[280px] shrink-0 flex-col">
            <div className="px-4 py-3">
              <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Activity
              </h2>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-1.5 px-4 pb-4">
                {activityFeed.map((entry) => (
                  <div
                    key={`${entry.taskId}-${entry.timestamp}`}
                    className="flex items-start gap-2 text-[11px]"
                  >
                    <span
                      className={cn(
                        'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                        STATUS_DOT[entry.status] ?? 'bg-muted-foreground',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-foreground">{entry.taskName}</span>
                      <span className="ml-1 text-muted-foreground">
                        {entry.status.replace('_', ' ')}
                      </span>
                      <div className="text-[10px] text-muted-foreground/60">
                        {relativeTime(entry.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  )
})

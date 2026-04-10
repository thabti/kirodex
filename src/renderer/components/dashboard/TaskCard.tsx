import { memo, useCallback } from 'react'
import { IconShieldExclamation } from '@tabler/icons-react'
import type { AgentTask, TaskStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useTaskStore } from '@/stores/taskStore'
import { cn } from '@/lib/utils'

const statusVariant: Record<TaskStatus, 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning'> = {
  running: 'success',
  paused: 'warning',
  completed: 'default',
  error: 'destructive',
  cancelled: 'secondary',
  pending_permission: 'warning',
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

export const TaskCard = memo(function TaskCard({ task }: { task: AgentTask }) {
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const setView = useTaskStore((s) => s.setView)
  const lastMsg = task.messages[task.messages.length - 1]
  const ctxPct = task.contextUsage != null ? Math.round((task.contextUsage.used / task.contextUsage.size) * 100) : null
  const ctxColor =
    ctxPct !== null
      ? ctxPct < 50 ? 'bg-success' : ctxPct < 80 ? 'bg-warning' : 'bg-destructive'
      : ''

  const handleClick = useCallback(() => {
    setSelectedTask(task.id)
    setView('chat')
  }, [task.id, setSelectedTask, setView])

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className="cursor-pointer transition-all hover:-translate-y-px hover:shadow-md"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="truncate text-sm">{task.name}</CardTitle>
          <Badge variant={statusVariant[task.status]} className="shrink-0">
            {task.status.replace('_', ' ')}
          </Badge>
        </div>
        <CardDescription className="truncate font-mono text-[11px]">
          {task.workspace}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        {ctxPct !== null && (
          <div className="mb-2 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-secondary">
              <div
                className={cn('h-full rounded-full transition-all', ctxColor)}
                style={{ width: `${ctxPct}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{ctxPct}%</span>
          </div>
        )}

        {lastMsg && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {lastMsg.role === 'user' ? 'You: ' : 'Agent: '}
            {lastMsg.content.slice(0, 200)}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{relativeTime(task.createdAt)}</span>
          {task.pendingPermission && (
            <div className="flex items-center gap-1 text-[10px] text-warning-foreground">
              <IconShieldExclamation className="h-3 w-3 animate-pulse" />
              Needs attention
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})

import { memo, useState } from 'react'
import {
  IconCircleCheck, IconCircle, IconListCheck,
  IconChevronDown, IconChevronRight,
} from '@tabler/icons-react'
import type { ToolCall } from '@/types'

interface TaskItem {
  id: string
  completed: boolean
  task_description: string
}

/** Extract task list from a tool call's rawOutput */
function extractTasks(rawOutput: unknown): TaskItem[] | null {
  if (!rawOutput || typeof rawOutput !== 'object') return null
  const out = rawOutput as Record<string, unknown>
  // Direct shape: { tasks: [...] }
  if (Array.isArray(out.tasks)) return out.tasks as TaskItem[]
  // Nested shape: { items: [{ Json: { tasks: [...] } }] }
  if (Array.isArray(out.items)) {
    const first = out.items[0] as Record<string, unknown> | undefined
    if (first?.Json && typeof first.Json === 'object') {
      const json = first.Json as Record<string, unknown>
      if (Array.isArray(json.tasks)) return json.tasks as TaskItem[]
    }
  }
  return null
}

function extractDescription(rawOutput: unknown): string | null {
  if (!rawOutput || typeof rawOutput !== 'object') return null
  const out = rawOutput as Record<string, unknown>
  if (typeof out.description === 'string' && out.description) return out.description
  if (Array.isArray(out.items)) {
    const first = out.items[0] as Record<string, unknown> | undefined
    if (first?.Json && typeof first.Json === 'object') {
      const json = first.Json as Record<string, unknown>
      if (typeof json.description === 'string' && json.description) return json.description
    }
  }
  return null
}

/** Check if a tool call is a task list operation */
export function isTaskListToolCall(tc: ToolCall): boolean {
  if (!tc.rawInput || typeof tc.rawInput !== 'object') return false
  const input = tc.rawInput as Record<string, unknown>
  return input.command === 'create' || input.command === 'complete' || input.command === 'add' || input.command === 'list'
}

/**
 * Aggregate the latest task state from all task-list tool calls in the group.
 * Later tool calls (complete/add) override earlier ones by task id.
 */
function aggregateLatestTasks(allToolCalls: ToolCall[]): { tasks: TaskItem[]; description: string | null } {
  const taskMap = new Map<string, TaskItem>()
  let description: string | null = null

  for (const tc of allToolCalls) {
    if (!isTaskListToolCall(tc)) continue
    const tasks = extractTasks(tc.rawOutput)
    const desc = extractDescription(tc.rawOutput)
    if (desc) description = desc
    if (tasks) {
      for (const t of tasks) {
        taskMap.set(t.id, t)
      }
    }
  }

  // Preserve insertion order (create order) for display
  return { tasks: Array.from(taskMap.values()), description }
}

/**
 * Check if this tool call is the last task-list tool call in the group.
 * We only render the task list on the last one to avoid duplicates.
 */
export function isLastTaskListToolCall(toolCall: ToolCall, allToolCalls: ToolCall[]): boolean {
  let lastId: string | null = null
  for (const tc of allToolCalls) {
    if (isTaskListToolCall(tc)) lastId = tc.toolCallId
  }
  return lastId === toolCall.toolCallId
}

interface TaskListDisplayProps {
  toolCall: ToolCall
  allToolCalls: ToolCall[]
}

export const TaskListDisplay = memo(function TaskListDisplay({ toolCall, allToolCalls }: TaskListDisplayProps) {
  const [expanded, setExpanded] = useState(true)

  // Only render on the last task-list tool call to avoid duplicates
  if (!isLastTaskListToolCall(toolCall, allToolCalls)) return null

  const { tasks, description } = aggregateLatestTasks(allToolCalls)
  if (!tasks.length) return null

  const completed = tasks.filter((t) => t.completed).length

  return (
    <div className="my-1 ml-1 rounded-lg border border-border/30 bg-card/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/5"
      >
        {expanded ? (
          <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground/40" />
        ) : (
          <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />
        )}
        <IconListCheck className="size-3.5 shrink-0 text-primary/60" />
        <span className="flex-1 truncate text-[13px] font-medium text-muted-foreground/70">
          {description ?? 'Task list'}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground/40">
          {completed}/{tasks.length}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/20 px-3 py-2">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-2 px-1.5 py-1">
              {task.completed
                ? <IconCircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400/70" />
                : <IconCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/25" />
              }
              <span className={`text-[13px] leading-[1.6] ${task.completed ? 'text-muted-foreground/40 line-through' : 'text-foreground/70'}`}>
                {task.task_description}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

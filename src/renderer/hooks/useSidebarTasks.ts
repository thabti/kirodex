import { useMemo, useRef } from 'react'
import { useTaskStore } from '@/stores/taskStore'

/** Minimal task shape for sidebar rendering — no messages, no streaming, no tool calls */
export interface SidebarTask {
  readonly id: string
  readonly name: string
  readonly workspace: string
  readonly createdAt: string
  readonly lastActivityAt: string
  readonly status: string
  readonly isArchived?: boolean
  readonly isDraft?: boolean
}

export type SortKey = 'recent' | 'oldest' | 'name-asc' | 'name-desc'

export interface SidebarProject {
  readonly name: string
  readonly cwd: string
  readonly tasks: readonly SidebarTask[]
}

function sortTasks(tasks: readonly SidebarTask[], sort: SortKey): SidebarTask[] {
  return [...tasks].sort((a, b) => {
    if (sort === 'name-asc') return a.name.localeCompare(b.name)
    if (sort === 'name-desc') return b.name.localeCompare(a.name)
    if (sort === 'oldest') return new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime()
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
  })
}

/**
 * Derives sidebar-only task data from the store with structural sharing.
 * Only re-renders when id, name, workspace, createdAt, or status change.
 * Streaming chunks, tool calls, messages, and thinking are ignored.
 */
export function useSidebarTasks(sort: SortKey): readonly SidebarProject[] {
  const tasks = useTaskStore((s) => s.tasks)
  const projects = useTaskStore((s) => s.projects)
  const projectNames = useTaskStore((s) => s.projectNames)
  const drafts = useTaskStore((s) => s.drafts)

  // Extract only sidebar-relevant fields and memoize with structural sharing
  const prevRef = useRef<Map<string, SidebarTask>>(new Map())

  const sidebarTasks = useMemo(() => {
    const prev = prevRef.current
    const next = new Map<string, SidebarTask>()
    let changed = prev.size !== Object.keys(tasks).length
    for (const t of Object.values(tasks)) {
      const msgs = t.messages
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1].timestamp : ''
      const lastActivityAt = lastMsg || t.createdAt
      const p = prev.get(t.id)
      if (p && p.name === t.name && p.status === t.status && p.createdAt === t.createdAt && p.workspace === t.workspace && p.isArchived === t.isArchived && p.lastActivityAt === lastActivityAt && !p.isDraft) {
        next.set(t.id, p)
      } else {
        changed = true
        next.set(t.id, { id: t.id, name: t.name, workspace: t.workspace, createdAt: t.createdAt, lastActivityAt, status: t.status, isArchived: t.isArchived })
      }
    }
    if (!changed) return prev
    prevRef.current = next
    return next
  }, [tasks])

  return useMemo(() => {
    // Group tasks by workspace
    const grouped = new Map<string, SidebarTask[]>()
    for (const task of sidebarTasks.values()) {
      const cwd = task.workspace
      if (!grouped.has(cwd)) grouped.set(cwd, [])
      grouped.get(cwd)!.push(task)
    }

    // Sort tasks within each group
    for (const [cwd, tasks] of grouped) {
      grouped.set(cwd, sortTasks(tasks, sort))
    }

    // Inject draft entries at the top of each workspace's list
    for (const [ws, content] of Object.entries(drafts)) {
      if (!content.trim()) continue
      const draftTask: SidebarTask = {
        id: `draft:${ws}`,
        name: content.trim(),
        workspace: ws,
        createdAt: new Date(0).toISOString(),
        lastActivityAt: new Date(0).toISOString(),
        status: 'draft',
        isDraft: true,
      }
      const existing = grouped.get(ws) ?? []
      grouped.set(ws, [draftTask, ...existing])
    }

    // Build project list from all known workspaces
    const result: SidebarProject[] = []
    const seen = new Set<string>()

    for (const ws of projects) {
      seen.add(ws)
      const tasks = grouped.get(ws) ?? []
      result.push({
        name: projectNames[ws] ?? ws.split('/').pop() ?? ws,
        cwd: ws,
        tasks,
      })
    }

    // Add any projects that have tasks but aren't in the projects array
    for (const [cwd, tasks] of grouped) {
      if (seen.has(cwd)) continue
      result.push({
        name: projectNames[cwd] ?? cwd.split('/').pop() ?? cwd,
        cwd,
        tasks,
      })
    }

    // Sort projects by the same key (using the most recent / oldest thread as proxy)
    if (sort === 'recent' || sort === 'oldest') {
      result.sort((a, b) => {
        const aTime = a.tasks.length > 0 ? new Date(a.tasks[0].lastActivityAt).getTime() : 0
        const bTime = b.tasks.length > 0 ? new Date(b.tasks[0].lastActivityAt).getTime() : 0
        return sort === 'recent' ? bTime - aTime : aTime - bTime
      })
    } else if (sort === 'name-asc') {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === 'name-desc') {
      result.sort((a, b) => b.name.localeCompare(a.name))
    }

    return result as readonly SidebarProject[]
  }, [sidebarTasks, sort, projects, projectNames, drafts])
}

import { useMemo, useRef } from 'react'
import { useTaskStore } from '@/stores/taskStore'

/** Minimal task shape for sidebar rendering — no messages, no streaming, no tool calls */
export interface SidebarTask {
  readonly id: string
  readonly name: string
  readonly workspace: string
  readonly createdAt: string
  readonly status: string
}

export type SortKey = 'recent' | 'oldest' | 'name-asc' | 'name-desc'

export interface SidebarProject {
  readonly name: string
  readonly cwd: string
  readonly tasks: readonly SidebarTask[]
}

function sortTasks(tasks: SidebarTask[], sort: SortKey): SidebarTask[] {
  return tasks.sort((a, b) => {
    if (sort === 'name-asc') return a.name.localeCompare(b.name)
    if (sort === 'name-desc') return b.name.localeCompare(a.name)
    if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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

  // Extract only sidebar-relevant fields and memoize with structural sharing
  const prevRef = useRef<SidebarTask[]>([])

  const sidebarTasks = useMemo(() => {
    const next: SidebarTask[] = []
    for (const t of Object.values(tasks)) {
      next.push({ id: t.id, name: t.name, workspace: t.workspace, createdAt: t.createdAt, status: t.status })
    }
    // Structural sharing: if nothing sidebar-relevant changed, return previous reference
    const prev = prevRef.current
    if (prev.length === next.length && prev.every((p, i) =>
      p.id === next[i].id && p.name === next[i].name && p.status === next[i].status && p.createdAt === next[i].createdAt
    )) {
      return prev
    }
    prevRef.current = next
    return next
  }, [tasks])

  return useMemo(() => {
    const sorted = sortTasks([...sidebarTasks], sort)
    const map = new Map<string, { name: string; cwd: string; tasks: SidebarTask[] }>()
    for (const task of sorted) {
      const cwd = task.workspace
      if (!map.has(cwd)) {
        map.set(cwd, { name: projectNames[cwd] ?? cwd.split('/').pop() ?? cwd, cwd, tasks: [] })
      }
      map.get(cwd)!.tasks.push(task)
    }
    // Add empty projects
    for (const ws of projects) {
      if (!map.has(ws)) {
        map.set(ws, { name: projectNames[ws] ?? ws.split('/').pop() ?? ws, cwd: ws, tasks: [] })
      } else if (projectNames[ws]) {
        map.get(ws)!.name = projectNames[ws]
      }
    }
    return Array.from(map.values()) as readonly SidebarProject[]
  }, [sidebarTasks, sort, projects, projectNames])
}

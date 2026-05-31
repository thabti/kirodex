import { useMemo, useRef } from 'react'
import { useTaskStore } from '@/stores/taskStore'
import { hasInteractiveQuestionBlocks } from '@/lib/question-parser'

/** Extract a display name from a workspace path, handling trailing slashes and empty segments. */
const getDisplayName = (ws: string, projectNames: Record<string, string>): string => {
  if (projectNames[ws]) return projectNames[ws]
  const segments = ws.replace(/\/+$/, '').split('/')
  const last = segments.pop()
  return last || ws || 'Untitled'
}

/** Minimal task shape for sidebar rendering — no messages, no streaming, no tool calls */
export interface SidebarTask {
  readonly id: string
  readonly name: string
  readonly workspace: string
  readonly projectId: string
  readonly createdAt: string
  readonly lastActivityAt: string
  /** Timestamp of the last user message (for "Last interaction" sort) */
  readonly lastUserMessageAt: string
  readonly status: string
  readonly isArchived?: boolean
  readonly isDraft?: boolean
  readonly worktreePath?: string
  readonly originalWorkspace?: string
  /** True when the last assistant message has unanswered questions */
  readonly hasPendingQuestion?: boolean
}

export type SortKey = 'created' | 'recent' | 'oldest' | 'name-asc' | 'name-desc' | 'custom' | 'interaction'

export interface SidebarProject {
  readonly name: string
  readonly cwd: string
  /** All non-archived threads for this project (pinned + unpinned, flat list) */
  readonly tasks: readonly SidebarTask[]
}

/** Top-level result of useSidebarTasks — projects list and global pinned threads */
export interface SidebarData {
  readonly projects: readonly SidebarProject[]
  /** Pinned threads across all projects, ordered by pinnedThreadIds */
  readonly globalPinned: readonly SidebarTask[]
}

function sortTasks(tasks: readonly SidebarTask[], sort: SortKey): SidebarTask[] {
  if (sort === 'created' || sort === 'custom') return [...tasks]
  return [...tasks].sort((a, b) => {
    if (sort === 'name-asc') return a.name.localeCompare(b.name)
    if (sort === 'name-desc') return b.name.localeCompare(a.name)
    if (sort === 'oldest') return new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime()
    if (sort === 'interaction') return new Date(b.lastUserMessageAt).getTime() - new Date(a.lastUserMessageAt).getTime()
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
  })
}

/**
 * Check if the last assistant message has unanswered question blocks.
 * Returns true when the most recent assistant message contains `[N]:` questions
 * and no subsequent user message has `questionAnswers`.
 */
function computeHasPendingQuestion(messages: readonly { role: string; content: string; questionAnswers?: unknown[] }[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'user') return false
    if (msg.role === 'assistant' && msg.content && hasInteractiveQuestionBlocks(msg.content)) {
      const hasAnswer = messages.slice(i + 1).some((m) => m.role === 'user' && m.questionAnswers?.length)
      return !hasAnswer
    }
  }
  return false
}

/**
 * Derives sidebar-only task data from the store with structural sharing.
 * Only re-renders when id, name, workspace, createdAt, or status change.
 * Streaming chunks, tool calls, messages, and thinking are ignored.
 */
export function useSidebarTasks(sort: SortKey): SidebarData {
  const tasks = useTaskStore((s) => s.tasks)
  const archivedMeta = useTaskStore((s) => s.archivedMeta)
  const projects = useTaskStore((s) => s.projects)
  const projectIds = useTaskStore((s) => s.projectIds)
  const projectNames = useTaskStore((s) => s.projectNames)
  const drafts = useTaskStore((s) => s.drafts)
  const threadOrders = useTaskStore((s) => s.threadOrders)
  const pinnedThreadIds = useTaskStore((s) => s.pinnedThreadIds)

  // Extract only sidebar-relevant fields and memoize with structural sharing
  const prevRef = useRef<Map<string, SidebarTask>>(new Map())

  const sidebarTasks = useMemo(() => {
    const prev = prevRef.current
    const next = new Map<string, SidebarTask>()
    const expectedSize = Object.keys(tasks).length + Object.keys(archivedMeta).length
    let changed = prev.size !== expectedSize
    // 1. Live + hydrated archived tasks
    for (const t of Object.values(tasks)) {
      const msgs = t.messages
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1].timestamp : ''
      const lastActivityAt = lastMsg || t.createdAt
      // Find the last user message timestamp for "interaction" sort
      let lastUserMessageAt = t.createdAt
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') { lastUserMessageAt = msgs[i].timestamp; break }
      }
      const pid = t.projectId ?? t.originalWorkspace ?? t.workspace
      const hasPendingQuestion = computeHasPendingQuestion(msgs)
      const p = prev.get(t.id)
      if (p && p.name === t.name && p.status === t.status && p.createdAt === t.createdAt && p.workspace === t.workspace && p.isArchived === t.isArchived && p.worktreePath === t.worktreePath && p.originalWorkspace === t.originalWorkspace && p.projectId === pid && p.lastActivityAt === lastActivityAt && p.lastUserMessageAt === lastUserMessageAt && p.hasPendingQuestion === hasPendingQuestion && !p.isDraft) {
        next.set(t.id, p)
      } else {
        changed = true
        next.set(t.id, { id: t.id, name: t.name, workspace: t.workspace, projectId: pid, createdAt: t.createdAt, lastActivityAt, lastUserMessageAt, status: t.status, isArchived: t.isArchived, worktreePath: t.worktreePath, originalWorkspace: t.originalWorkspace, hasPendingQuestion })
      }
    }
    // 2. Archived metadata — read-only, never have pending questions, never inflated
    for (const m of Object.values(archivedMeta)) {
      // Skip if a hydrated version is already in the map (transitioning)
      if (next.has(m.id)) continue
      const pid = m.projectId ?? m.originalWorkspace ?? m.workspace
      const p = prev.get(m.id)
      if (p && p.name === m.name && p.status === 'completed' && p.createdAt === m.createdAt && p.workspace === m.workspace && p.isArchived === true && p.worktreePath === m.worktreePath && p.originalWorkspace === m.originalWorkspace && p.projectId === pid && p.lastActivityAt === m.lastActivityAt && !p.hasPendingQuestion && !p.isDraft) {
        next.set(m.id, p)
      } else {
        changed = true
        next.set(m.id, {
          id: m.id,
          name: m.name,
          workspace: m.workspace,
          projectId: pid,
          createdAt: m.createdAt,
          lastActivityAt: m.lastActivityAt,
          lastUserMessageAt: m.lastActivityAt, // Best approximation for archived threads
          status: 'completed',
          isArchived: true,
          worktreePath: m.worktreePath,
          originalWorkspace: m.originalWorkspace,
          hasPendingQuestion: false,
        })
      }
    }
    if (!changed) return prev
    prevRef.current = next
    return next
  }, [tasks, archivedMeta])

  return useMemo(() => {
    const pinnedSet = new Set(pinnedThreadIds)
    // Group tasks by projectId — the canonical project identity
    const grouped = new Map<string, SidebarTask[]>()
    for (const task of sidebarTasks.values()) {
      const cwd = task.projectId
      if (!grouped.has(cwd)) grouped.set(cwd, [])
      grouped.get(cwd)!.push(task)
    }

    // Build reverse map: projectId → workspace path for display and thread order lookup
    const idToWorkspace = new Map<string, string>()
    for (const [ws, pid] of Object.entries(projectIds)) {
      idToWorkspace.set(pid, ws)
    }

    // Sort tasks within each group
    for (const [cwd, tasks] of grouped) {
      if (sort === 'custom') {
        // Resolve workspace from projectId for threadOrders lookup
        const ws = idToWorkspace.get(cwd) ?? cwd
        const order = threadOrders[ws]
        if (order?.length) {
          const orderMap = new Map(order.map((id, i) => [id, i]))
          const ordered = [...tasks].sort((a, b) => {
            const ai = orderMap.get(a.id) ?? Infinity
            const bi = orderMap.get(b.id) ?? Infinity
            return ai - bi
          })
          grouped.set(cwd, ordered)
        }
      } else {
        grouped.set(cwd, sortTasks(tasks, sort))
      }
    }

    // Inject draft entries — drafts are keyed by workspace, resolve to projectId
    for (const [ws, content] of Object.entries(drafts)) {
      if (!content.trim()) continue
      const pid = projectIds[ws] ?? ws
      const draftTask: SidebarTask = {
        id: `draft:${ws}`,
        name: content.trim(),
        workspace: ws,
        projectId: pid,
        createdAt: new Date(0).toISOString(),
        lastActivityAt: new Date(0).toISOString(),
        lastUserMessageAt: new Date(0).toISOString(),
        status: 'draft',
        isDraft: true,
      }
      const existing = grouped.get(pid) ?? []
      grouped.set(pid, [draftTask, ...existing])
    }

    // Collect worktree workspace paths so they don't appear as top-level projects
    const worktreeWorkspaces = new Set<string>()
    for (const task of sidebarTasks.values()) {
      if (task.worktreePath) {
        worktreeWorkspaces.add(task.workspace)
        worktreeWorkspaces.add(task.worktreePath)
      }
    }

    // Build project list from all known workspaces (skip worktree paths)
    const result: SidebarProject[] = []
    const seenPid = new Set<string>()
    const seenCwd = new Set<string>()

    for (const ws of projects) {
      if (worktreeWorkspaces.has(ws)) continue
      if (seenCwd.has(ws)) continue
      const pid = projectIds[ws] ?? ws
      if (seenPid.has(pid)) continue
      seenPid.add(pid)
      seenCwd.add(ws)
      const all = grouped.get(pid) ?? []
      result.push({
        name: getDisplayName(ws, projectNames),
        cwd: ws,
        tasks: [...all],
      })
    }

    // Add any projects that have tasks but aren't in the projects array
    for (const [pid, tasks] of grouped) {
      if (seenPid.has(pid)) continue
      seenPid.add(pid)
      const ws = idToWorkspace.get(pid) ?? pid
      // Skip orphaned UUID projectIds with no workspace mapping
      if (!idToWorkspace.has(pid) && !pid.startsWith('/')) continue
      if (worktreeWorkspaces.has(ws)) continue
      if (seenCwd.has(ws)) continue
      seenCwd.add(ws)
      result.push({
        name: getDisplayName(ws, projectNames),
        cwd: ws,
        tasks: [...tasks],
      })
    }

    // Sort projects by the same key (using the most recent / oldest thread as proxy)
    // 'custom' preserves the store's manual order — no sorting
    if (sort === 'recent' || sort === 'oldest' || sort === 'interaction') {
      result.sort((a, b) => {
        const timeField = sort === 'interaction' ? 'lastUserMessageAt' : 'lastActivityAt'
        const aFirst = a.tasks[0]
        const bFirst = b.tasks[0]
        const aTime = aFirst ? new Date(aFirst[timeField]).getTime() : 0
        const bTime = bFirst ? new Date(bFirst[timeField]).getTime() : 0
        return sort === 'oldest' ? aTime - bTime : bTime - aTime
      })
    } else if (sort === 'name-asc') {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === 'name-desc') {
      result.sort((a, b) => b.name.localeCompare(a.name))
    }

    // Compute globalPinned across all known tasks, preserving pinnedThreadIds order.
    // Skip archived and draft tasks.
    const globalPinned: SidebarTask[] = []
    if (pinnedSet.size > 0) {
      const byId = new Map<string, SidebarTask>()
      for (const t of sidebarTasks.values()) {
        if (!pinnedSet.has(t.id)) continue
        if (t.isArchived) continue
        byId.set(t.id, t)
      }
      for (const id of pinnedThreadIds) {
        const t = byId.get(id)
        if (t) globalPinned.push(t)
      }
    }

    return {
      projects: result as readonly SidebarProject[],
      globalPinned: globalPinned as readonly SidebarTask[],
    }
  }, [sidebarTasks, sort, projects, projectIds, projectNames, drafts, threadOrders, pinnedThreadIds])
}

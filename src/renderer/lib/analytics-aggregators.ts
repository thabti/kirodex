import type { AnalyticsEvent, AnalyticsEventKind } from '@/types/analytics'
import { ipc } from '@/lib/ipc'

export interface DayValue { day: string; value: number; value2?: number }

// ── Backend-aggregated wrappers (preferred for new charts) ────────────────────
//
// These thin wrappers forward to the Rust aggregation commands added in
// `commands/analytics.rs`. Charts should consume these directly instead of
// loading the whole event array and rolling it up in JS.
//
// The legacy in-process aggregators below remain to keep existing charts
// compiling during the per-chart migration. New charts should use the
// `*FromBackend` helpers; existing ones can be migrated one by one.

export const codingHoursByDayFromBackend = (since?: number) =>
  ipc.analyticsCodingHoursByDay(since)
export const messagesByDayFromBackend = (since?: number) =>
  ipc.analyticsMessagesByDay(since)
export const tokensByDayFromBackend = (since?: number) =>
  ipc.analyticsTokensByDay(since)
export const diffStatsByDayFromBackend = (since?: number) =>
  ipc.analyticsDiffStatsByDay(since)
export const modelPopularityFromBackend = (since?: number) =>
  ipc.analyticsModelPopularity(since)
export const toolCallBreakdownFromBackend = (since?: number) =>
  ipc.analyticsToolCallBreakdown(since)
export const modeUsageFromBackend = (since?: number) =>
  ipc.analyticsModeUsage(since)
export const projectStatsFromBackend = (since?: number) =>
  ipc.analyticsProjectStats(since)
export const totalsFromBackend = (since?: number) => ipc.analyticsTotals(since)

// ── Legacy in-process aggregators (do not extend; migrate consumers instead) ──

/** Pre-partition events by kind in a single pass. O(n) instead of O(n * k). */
export interface PartitionedEvents {
  session: AnalyticsEvent[]
  message_sent: AnalyticsEvent[]
  message_received: AnalyticsEvent[]
  token_usage: AnalyticsEvent[]
  tool_call: AnalyticsEvent[]
  file_edited: AnalyticsEvent[]
  diff_stats: AnalyticsEvent[]
  slash_cmd: AnalyticsEvent[]
  model_used: AnalyticsEvent[]
  mode_switch: AnalyticsEvent[]
  thread_created: AnalyticsEvent[]
  mcp_used: AnalyticsEvent[]
  skill_used: AnalyticsEvent[]
}

const EMPTY: AnalyticsEvent[] = []

export const partitionEvents = (events: AnalyticsEvent[]): PartitionedEvents => {
  const p: PartitionedEvents = {
    session: [], message_sent: [], message_received: [], token_usage: [],
    tool_call: [], file_edited: [], diff_stats: [], slash_cmd: [],
    model_used: [], mode_switch: [], thread_created: [], mcp_used: [], skill_used: [],
  }
  for (const e of events) {
    const bucket = p[e.kind as AnalyticsEventKind]
    if (bucket) bucket.push(e)
  }
  return p
}

/** Group events by day using fast math (no Date object per event). */
const dayKey = (ts: number): string => {
  // Faster than new Date(ts).toISOString().slice(0,10) — avoids object allocation
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`
}

const byDay = (events: AnalyticsEvent[]): Map<string, AnalyticsEvent[]> => {
  const map = new Map<string, AnalyticsEvent[]>()
  for (const e of events) {
    const key = dayKey(e.ts)
    let arr = map.get(key)
    if (!arr) { arr = []; map.set(key, arr) }
    arr.push(e)
  }
  return map
}

const countBy = (events: AnalyticsEvent[], field: 'detail' | 'project'): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const e of events) {
    const key = e[field] ?? 'unknown'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

const sumValue = (events: AnalyticsEvent[]): number => {
  let s = 0
  for (const e of events) s += e.value ?? 0
  return s
}

// ── Public aggregators (all take pre-partitioned slices) ──────────

export const computeCodingHoursByDay = (events: AnalyticsEvent[]): DayValue[] => {
  const days = byDay(events)
  return [...days.entries()].map(([day, evts]) => ({
    day,
    value: Math.round(sumValue(evts) / 3600 * 10) / 10,
  })).sort((a, b) => a.day.localeCompare(b.day))
}

export const computeTotalCodingHours = (events: AnalyticsEvent[]): number =>
  Math.round(sumValue(events) / 3600 * 10) / 10

export const computeMessagesByDay = (sent: AnalyticsEvent[], received: AnalyticsEvent[]): DayValue[] => {
  const sentDays = byDay(sent)
  const recvDays = byDay(received)
  const allDays = new Set([...sentDays.keys(), ...recvDays.keys()])
  return [...allDays].sort().map((day) => ({
    day,
    value: sentDays.get(day)?.length ?? 0,
    value2: recvDays.get(day)?.length ?? 0,
  }))
}

export const computeTotalInputWords = (events: AnalyticsEvent[]): number => sumValue(events)
export const computeTotalOutputWords = (events: AnalyticsEvent[]): number => sumValue(events)

export const computeTokensByDay = (events: AnalyticsEvent[]): DayValue[] => {
  const days = byDay(events)
  return [...days.entries()].map(([day, evts]) => ({
    day, value: sumValue(evts),
  })).sort((a, b) => a.day.localeCompare(b.day))
}

export const computeTotalTokens = (events: AnalyticsEvent[]): number => sumValue(events)

export const computeDiffStatsByDay = (events: AnalyticsEvent[]): DayValue[] => {
  const days = byDay(events)
  return [...days.entries()].map(([day, evts]) => ({
    day,
    value: sumValue(evts),
    value2: evts.reduce((s, e) => s + (e.value2 ?? 0), 0),
  })).sort((a, b) => a.day.localeCompare(b.day))
}

export const computeModelPopularity = (events: AnalyticsEvent[]): Record<string, number> =>
  countBy(events, 'detail')

export const computeModeUsage = (events: AnalyticsEvent[]): Record<string, number> =>
  countBy(events, 'detail')

/** Parse slash_cmd detail field. New format: "name:mode", legacy: "name" */
const parseSlashDetail = (detail: string): { name: string; mode: string } => {
  const idx = detail.lastIndexOf(':')
  if (idx > 0 && (detail.endsWith(':plan') || detail.endsWith(':command'))) {
    return { name: detail.slice(0, idx), mode: detail.slice(idx + 1) }
  }
  return { name: detail, mode: 'unknown' }
}

export interface SlashCommandModeData {
  readonly totals: Record<string, number>
  readonly byMode: Record<string, { command: number; plan: number }>
}

export const computeSlashCommandUsage = (events: AnalyticsEvent[]): SlashCommandModeData => {
  const totals: Record<string, number> = {}
  const byMode: Record<string, { command: number; plan: number }> = {}
  for (const e of events) {
    const raw = e.detail ?? 'unknown'
    const { name, mode } = parseSlashDetail(raw)
    totals[name] = (totals[name] ?? 0) + 1
    if (!byMode[name]) byMode[name] = { command: 0, plan: 0 }
    if (mode === 'plan') byMode[name].plan += 1
    else byMode[name].command += 1
  }
  return { totals, byMode }
}

export const computeToolCallBreakdown = (events: AnalyticsEvent[]): Record<string, number> =>
  countBy(events, 'detail')

export const computeEditedFiles = (events: AnalyticsEvent[]): Record<string, number> =>
  countBy(events, 'detail')

export const computeProjectStats = (
  threadEvents: AnalyticsEvent[],
  messageEvents: AnalyticsEvent[],
): { project: string; threads: number; messages: number }[] => {
  const threads = new Map<string, Set<string>>()
  const messages = new Map<string, number>()
  for (const e of threadEvents) {
    if (!e.project) continue
    let set = threads.get(e.project)
    if (!set) { set = new Set(); threads.set(e.project, set) }
    if (e.thread) set.add(e.thread)
  }
  for (const e of messageEvents) {
    if (!e.project) continue
    messages.set(e.project, (messages.get(e.project) ?? 0) + 1)
  }
  const allProjects = new Set([...threads.keys(), ...messages.keys()])
  return [...allProjects].map((project) => ({
    project,
    threads: threads.get(project)?.size ?? 0,
    messages: messages.get(project) ?? 0,
  })).sort((a, b) => b.messages - a.messages)
}

export const computeMcpUsage = (events: AnalyticsEvent[]): Record<string, number> =>
  countBy(events, 'detail')

export const computeTotalMessages = (sent: AnalyticsEvent[], received: AnalyticsEvent[]): number =>
  sent.length + received.length

export const computeTotalDiffAdditions = (events: AnalyticsEvent[]): number => sumValue(events)

export const computeTotalDiffDeletions = (events: AnalyticsEvent[]): number =>
  events.reduce((s, e) => s + (e.value2 ?? 0), 0)

export const computeTotalFilesEdited = (events: AnalyticsEvent[]): number =>
  new Set(events.map((e) => e.detail).filter(Boolean)).size

export const computeTotalToolCalls = (events: AnalyticsEvent[]): number => events.length

// ── Model pricing ($ per million tokens) ──────────

interface ModelPricing {
  readonly input: number
  readonly output: number
}

/**
 * Pricing map for Claude models. Keys are matched as substrings against model IDs.
 * Order matters: more specific patterns first.
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing (April 2026)
 */
const MODEL_PRICING: readonly { readonly pattern: string; readonly pricing: ModelPricing }[] = [
  // Opus tiers
  { pattern: 'opus-4-', pricing: { input: 15, output: 75 } },
  { pattern: 'opus-4.1', pricing: { input: 15, output: 75 } },
  { pattern: 'opus-4.5', pricing: { input: 5, output: 25 } },
  { pattern: 'opus-4.6', pricing: { input: 5, output: 25 } },
  { pattern: 'opus-4.7', pricing: { input: 5, output: 25 } },
  { pattern: 'opus-3', pricing: { input: 15, output: 75 } },
  // Sonnet tiers
  { pattern: 'sonnet-4-', pricing: { input: 3, output: 15 } },
  { pattern: 'sonnet-4.5', pricing: { input: 3, output: 15 } },
  { pattern: 'sonnet-4.6', pricing: { input: 3, output: 15 } },
  { pattern: 'sonnet-3', pricing: { input: 3, output: 15 } },
  // Haiku tiers
  { pattern: 'haiku-4.5', pricing: { input: 1, output: 5 } },
  { pattern: 'haiku-3.5', pricing: { input: 0.80, output: 4 } },
  { pattern: 'haiku-3', pricing: { input: 0.25, output: 1.25 } },
] as const

const findPricing = (modelId: string): ModelPricing | null => {
  const lower = modelId.toLowerCase()
  for (const entry of MODEL_PRICING) {
    if (lower.includes(entry.pattern)) return entry.pricing
  }
  return null
}

/**
 * Estimate total cost from token_usage and model_used events.
 * Uses a simple heuristic: assume ~25% of tokens are output, ~75% input.
 * This is an estimate since we don't have separate input/output token counts.
 */
export const computeEstimatedCost = (
  tokenEvents: AnalyticsEvent[],
  modelEvents: AnalyticsEvent[],
): number => {
  if (tokenEvents.length === 0 || modelEvents.length === 0) return 0
  // Find the most-used model to use as the pricing basis
  const modelCounts = countBy(modelEvents, 'detail')
  let topModel = ''
  let topCount = 0
  for (const [model, count] of Object.entries(modelCounts)) {
    if (count > topCount) { topModel = model; topCount = count }
  }
  const pricing = findPricing(topModel)
  if (!pricing) return 0
  const totalTokens = sumValue(tokenEvents)
  // Heuristic split: 75% input, 25% output
  const inputTokens = totalTokens * 0.75
  const outputTokens = totalTokens * 0.25
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

export const findModelPricing = findPricing

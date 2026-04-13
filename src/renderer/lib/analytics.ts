/**
 * Thin PostHog wrapper. Every call site goes through here so we have a single
 * on/off gate, a single list of super-properties, and a single place where we
 * strip accidental PII.
 *
 * Hard-disabled unless ALL of:
 *   1. This is a production build (`import.meta.env.PROD`) — dev never reports
 *   2. `import.meta.env.VITE_POSTHOG_API_KEY` is set at build time
 *   3. The user has opted in via Settings → Advanced (`analyticsEnabled`)
 *
 * Nothing sensitive leaves the machine — we track enumerations only
 * (e.g. `git_op: "commit"`), never prompts, file contents, paths, branch names,
 * or commit messages.
 */

import type { PostHog } from 'posthog-js'
import { getVersion } from '@tauri-apps/api/app'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_API_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'
const DEV = import.meta.env.DEV
const PROD = import.meta.env.PROD

type FeatureName =
  | 'slash_command'
  | 'git'
  | 'diff_viewer'
  | 'terminal'
  | 'model_switch'
  | 'profile_switch'
  | 'mode_switch'

type EventMap = {
  app_opened: Record<string, never>
  app_version_seen: { previous_version?: string | null }
  feature_used: { feature: FeatureName; detail?: string }
  update_check: { result: 'none' | 'available' | 'error'; latest_version?: string | null }
  update_available: { latest_version: string; current_version?: string | null }
  update_downloaded: { from_version?: string | null; to_version: string }
  update_installed: { from_version?: string | null; to_version: string }
  update_dismissed: { available_version: string }
  update_restart_clicked: { to_version?: string | null }
  settings_changed: { key: string }
  task_created: { has_prompt: boolean }
  task_completed: { status: string }
  error_surfaced: { scope: string; code?: string }
}

export type AnalyticsEvent = keyof EventMap

let client: PostHog | null = null
let ready = false
let superProps: Record<string, string | number | null | undefined> = {}

/** Fire-and-forget, never throws. */
const safe = <T>(fn: () => T): T | undefined => {
  try { return fn() } catch (err) {
    if (DEV) console.warn('[analytics]', err)
    return undefined
  }
}

const hasKey = (): boolean => !!POSTHOG_KEY && POSTHOG_KEY.length > 0

/** Production-only gate — dev builds never report, even with a key set. */
const isEligibleBuild = (): boolean => PROD && !DEV

const detectPlatform = (): string => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Mac/.test(ua)) return 'darwin'
  if (/Win/.test(ua)) return 'win32'
  if (/Linux/.test(ua)) return 'linux'
  return 'unknown'
}

const detectArch = (): string => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/arm64|aarch64/i.test(ua)) return 'arm64'
  if (/x86_64|x64|wow64/i.test(ua)) return 'x64'
  return 'unknown'
}

/**
 * Initialize PostHog if it's enabled and keyed. Idempotent.
 * Returns `true` when the client is live, `false` when analytics is off.
 */
export const initAnalytics = async (
  opts: {
    enabled: boolean
    distinctId: string | null
    previousVersion?: string | null
  },
): Promise<boolean> => {
  if (!isEligibleBuild()) {
    if (DEV) console.info('[analytics] disabled: dev build')
    return false
  }
  if (!opts.enabled || !hasKey()) {
    if (!hasKey()) console.info('[analytics] disabled: no VITE_POSTHOG_API_KEY')
    return false
  }
  if (ready) return true

  const appVersion = await safe(() => getVersion()) ?? 'unknown'
  superProps = {
    app_version: appVersion,
    platform: detectPlatform(),
    arch: detectArch(),
    channel: 'release',
  }

  try {
    const mod = await import('posthog-js')
    const posthog = mod.default
    posthog.init(POSTHOG_KEY!, {
      api_host: POSTHOG_HOST,
      // Privacy-forward defaults.
      persistence: 'localStorage',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      loaded: (ph) => {
        if (opts.distinctId) ph.identify(opts.distinctId)
        ph.register(superProps)
      },
    })
    client = posthog
    ready = true

    // Fire the two boot events the dashboards need.
    track('app_opened', {})
    if (opts.previousVersion && opts.previousVersion !== appVersion) {
      track('app_version_seen', { previous_version: opts.previousVersion })
    } else {
      track('app_version_seen', {})
    }
    return true
  } catch (err) {
    if (DEV) console.warn('[analytics] init failed', err)
    return false
  }
}

/** Tear down the client when the user opts out. */
export const resetAnalytics = (): void => {
  safe(() => client?.reset())
  safe(() => client?.opt_out_capturing())
  client = null
  ready = false
  superProps = {}
}

/** Type-safe event tracker. Silent no-op when analytics is off. */
export const track = <E extends AnalyticsEvent>(event: E, props: EventMap[E]): void => {
  if (!ready || !client) return
  safe(() => client!.capture(event, { ...superProps, ...(props as Record<string, unknown>) }))
}

export const isAnalyticsReady = (): boolean => ready

/** Stable anon id for the opted-in user. Generated fresh on each opt-in. */
export const makeAnonId = (): string => {
  // crypto.randomUUID is available in all modern webviews Tauri ships with.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback — not cryptographically strong but adequate for a non-secret id.
  return `kx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Remember the last version we ran so `app_version_seen` can compute a delta. */
const LAST_VERSION_KEY = 'kirodex-last-version'

export const readLastVersion = (): string | null => {
  try { return localStorage.getItem(LAST_VERSION_KEY) } catch { return null }
}

export const writeLastVersion = (version: string): void => {
  try { localStorage.setItem(LAST_VERSION_KEY, version) } catch { /* private mode */ }
}

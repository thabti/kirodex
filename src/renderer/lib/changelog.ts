export interface ChangelogEntry {
  readonly version: string
  readonly highlights: readonly string[]
}

/**
 * Changelog entries ordered newest-first.
 * The first entry is shown in the "What's New" dialog after an update.
 */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '0.38.0',
    highlights: [
      'Per-panel state and performance improvements for split view',
      'Slash command mode tracking with estimated token cost',
      'Fixed z-index conflict with settings panel',
      'Plus 3 more improvements across the app',
    ],
  },
  {
    version: '0.37.0',
    highlights: [
      'Light, dark, and system theme toggle',
      'Thread pinning to keep important conversations at the top',
      'Always-visible close button on the right split panel',
      'Permission requests now appear inside /btw overlay',
      'Plus 4 more improvements across the app',
    ],
  },
  {
    version: '0.36.0',
    highlights: [
      'Split-screen view — two threads side by side with Cmd+\\',
      'Drag-to-reorder projects and Cmd+N project jumping',
      'Git init support for non-git projects',
      'Plus 6 more improvements across the app',
    ],
  },
] as const

/**
 * Compare two semver strings. Returns true if `a` is strictly newer than `b`.
 * Handles versions like "0.38.0" (no "v" prefix expected).
 */
export const isNewerVersion = (a: string, b: string): boolean => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va > vb) return true
    if (va < vb) return false
  }
  return false
}

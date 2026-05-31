import type { FileDiffMetadata } from '@pierre/diffs'

interface DiffThemeColors {
  background: string
  card: string
  accent: string
  muted: string
  mutedForeground: string
  border: string
}

const LIGHT_COLORS: DiffThemeColors = {
  background: '#ffffff',
  card: '#fafafa',
  accent: 'rgba(0, 0, 0, 0.05)',
  muted: 'rgba(0, 0, 0, 0.04)',
  mutedForeground: '#636363',
  border: '#e5e5e5',
}

const DARK_COLORS: DiffThemeColors = {
  background: '#0D0D0D',
  card: '#141414',
  accent: 'rgba(255, 255, 255, 0.07)',
  muted: 'rgba(255, 255, 255, 0.06)',
  mutedForeground: '#9a9a9a',
  border: 'rgba(255, 255, 255, 0.02)',
}

export const buildUnsafeCSS = (isDark: boolean): string => {
  const c = isDark ? DARK_COLORS : LIGHT_COLORS
  return `
:host {
  background-color: ${c.card} !important;
}
[data-diffs-header], [data-diff], [data-file] {
  --diffs-bg: ${c.card} !important;
  --diffs-bg-addition: color-mix(in srgb, ${c.background} 97%, #0dbe4e) !important;
  --diffs-bg-deletion: color-mix(in srgb, ${c.background} 97%, #ff2e3f) !important;
  --diffs-bg-addition-emphasis: color-mix(in srgb, ${c.background} 92%, #0dbe4e) !important;
  --diffs-bg-deletion-emphasis: color-mix(in srgb, ${c.background} 92%, #ff2e3f) !important;
  --diffs-bg-addition-number: color-mix(in srgb, ${c.background} 95%, #0dbe4e) !important;
  --diffs-bg-deletion-number: color-mix(in srgb, ${c.background} 95%, #ff2e3f) !important;
  --diffs-bg-addition-hover: color-mix(in srgb, ${c.background} 93%, #0dbe4e) !important;
  --diffs-bg-deletion-hover: color-mix(in srgb, ${c.background} 93%, #ff2e3f) !important;
  --diffs-bg-buffer-override: ${c.background} !important;
  --diffs-bg-hover-override: ${c.accent} !important;
  --diffs-bg-context-override: ${c.card} !important;
  --diffs-bg-separator-override: ${c.muted} !important;
  --diffs-fg-number-override: color-mix(in srgb, ${c.mutedForeground} 50%, transparent) !important;
  font-size: 12px !important;
  line-height: 20px !important;
}
[data-diffs-header] {
  background: ${c.card} !important;
  border-bottom: 1px solid ${c.border} !important;
}
[data-separator-content] {
  overflow: visible !important;
}
[data-unmodified-lines] {
  overflow: visible !important;
}
`
}

/** @deprecated Use buildUnsafeCSS(isDark) instead */
export const UNSAFE_CSS = buildUnsafeCSS(true)

export interface FileStats {
  name: string
  additions: number
  deletions: number
}

export const getFileStats = (files: FileDiffMetadata[]): FileStats[] =>
  files.map((f) => {
    let additions = 0
    let deletions = 0
    for (const hunk of f.hunks) {
      additions += hunk.additionLines
      deletions += hunk.deletionLines
    }
    return { name: f.name.replace(/^[ab]\//, ''), additions, deletions }
  })

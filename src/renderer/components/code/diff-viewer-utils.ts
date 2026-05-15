import type { FileDiffMetadata } from '@pierre/diffs'

export const UNSAFE_CSS = `
:host {
  background-color: var(--card) !important;
}
[data-diffs-header], [data-diff], [data-file] {
  --diffs-bg: var(--card) !important;
  --diffs-bg-addition: color-mix(in srgb, var(--background) 97%, #0dbe4e) !important;
  --diffs-bg-deletion: color-mix(in srgb, var(--background) 97%, #ff2e3f) !important;
  --diffs-bg-addition-emphasis: color-mix(in srgb, var(--background) 92%, #0dbe4e) !important;
  --diffs-bg-deletion-emphasis: color-mix(in srgb, var(--background) 92%, #ff2e3f) !important;
  --diffs-bg-addition-number: color-mix(in srgb, var(--background) 95%, #0dbe4e) !important;
  --diffs-bg-deletion-number: color-mix(in srgb, var(--background) 95%, #ff2e3f) !important;
  --diffs-bg-addition-hover: color-mix(in srgb, var(--background) 93%, #0dbe4e) !important;
  --diffs-bg-deletion-hover: color-mix(in srgb, var(--background) 93%, #ff2e3f) !important;
  --diffs-bg-buffer-override: var(--background) !important;
  --diffs-bg-hover-override: var(--accent) !important;
  --diffs-bg-context-override: var(--card) !important;
  --diffs-bg-separator-override: var(--muted) !important;
  --diffs-fg-number-override: color-mix(in srgb, var(--muted-foreground) 50%, transparent) !important;
  font-size: 12px !important;
  line-height: 20px !important;
}
[data-diffs-header] {
  background: var(--card) !important;
  border-bottom: 1px solid var(--border) !important;
}
[data-separator-content] {
  overflow: visible !important;
}
[data-unmodified-lines] {
  overflow: visible !important;
}
`

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

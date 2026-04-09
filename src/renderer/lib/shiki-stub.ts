// Stub for shiki — removes ~300 language grammar chunks (~8MB) from the bundle.
// @pierre/diffs still renders diffs correctly (addition/deletion coloring),
// just without per-language syntax highlighting.

export const bundledLanguages = {}
export const bundledThemes = {}

export function createHighlighter() {
  return Promise.resolve({
    codeToTokens: () => ({ tokens: [], bg: '', fg: '', themeName: '' }),
    getLoadedLanguages: () => [],
    getLoadedThemes: () => [],
    loadLanguage: () => Promise.resolve(),
    loadTheme: () => Promise.resolve(),
  })
}

export function createJavaScriptRegexEngine() {
  return {}
}

export function createOnigurumaEngine() {
  return Promise.resolve({})
}

export function codeToHtml(code: string) {
  return `<pre><code>${code}</code></pre>`
}

export function createCssVariablesTheme() {
  return { name: 'css-variables', type: 'css-variables' }
}

export function normalizeTheme(theme: unknown) {
  return theme
}

export function getTokenStyleObject() {
  return {}
}

export function stringifyTokenStyle() {
  return ''
}

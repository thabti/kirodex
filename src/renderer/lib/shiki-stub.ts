// Stub for shiki — removes ~300 language grammar chunks (~8MB) from the bundle.
// @pierre/diffs still renders diffs correctly (addition/deletion coloring),
// just without per-language syntax highlighting.

// Proxy that returns a no-op loader for any language, preventing
// @pierre/diffs resolveLanguage from throwing "not found" errors.
const noopLang = { default: { name: 'text', patterns: [], scopeName: 'source.text' } }
export const bundledLanguages = new Proxy({} as Record<string, () => Promise<unknown>>, {
  has: () => true,
  get: (_target, prop) => {
    if (typeof prop === 'string') return () => Promise.resolve(noopLang)
    return undefined
  },
  getOwnPropertyDescriptor: (_target, _prop) => ({
    configurable: true,
    enumerable: true,
    writable: true,
    value: () => Promise.resolve(noopLang),
  }),
})
export const bundledThemes = {}

// Minimal theme object returned by getTheme — satisfies @pierre/diffs internal calls.
const NOOP_THEME = {
  name: 'noop',
  type: 'dark',
  bg: '#111114',
  fg: '#eeeeee',
  settings: [],
  colors: {},
}

// Highlighter stub that handles any method @pierre/diffs might call.
// Known methods are implemented; unknown ones return a no-op via Proxy
// so new @pierre/diffs versions don't crash the app.
// Return empty tokens so @pierre/diffs falls back to its own diff-aware
// line coloring (addition/deletion backgrounds). Returning actual tokens
// would bypass that fallback and lose red/green diff highlighting.
const HIGHLIGHTER_IMPL: Record<string, unknown> = {
  codeToTokens: () => ({ tokens: [], bg: '#111114', fg: '#eeeeee', themeName: 'noop' }),
  codeToTokensBase: () => ({ tokens: [], bg: '#111114', fg: '#eeeeee', themeName: 'noop' }),
  codeToHtml: (code: string) => `<pre><code>${code}</code></pre>`,
  getLoadedLanguages: () => ['text'],
  getLoadedThemes: () => ['noop'],
  getTheme: () => NOOP_THEME,
  loadLanguage: () => Promise.resolve(),
  loadLanguageSync: () => {},
  loadTheme: () => Promise.resolve(),
  loadThemeSync: () => {},
  getLanguage: () => ({ name: 'text' }),
  setTheme: () => NOOP_THEME,
  dispose: () => {},
}

const highlighterProxy = new Proxy(HIGHLIGHTER_IMPL, {
  get(target, prop) {
    if (prop in target) return target[prop as string]
    // Return a no-op function for any unknown method
    return () => {}
  },
})

export function createHighlighter() {
  return Promise.resolve(highlighterProxy)
}

export function createHighlighterCore() {
  return Promise.resolve(highlighterProxy)
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

// Catch-all: if @pierre/diffs (or any consumer) imports a named export we
// haven't listed above, this default-export Proxy returns a no-op so the
// app never crashes from a missing shiki API.
export default new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    if (typeof prop === 'string') {
      // Check if we already export it as a named export — if so, return
      // undefined so the named export takes precedence.
      return () => {}
    }
    return undefined
  },
})

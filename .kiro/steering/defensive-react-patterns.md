---
alwaysApply: true
---

# Defensive React patterns

## localStorage in Zustand stores

Always wrap `localStorage` access in try-catch. It throws in private browsing, incognito, and quota-exceeded contexts.

- Store init: `(() => { try { return localStorage.getItem(key) } catch { return null } })()`
- Setters: wrap `setItem` in try-catch with `console.warn`, then update in-memory state regardless

## Mutable references in hooks

Never use module-level `let` variables to hold mutable state consumed by React hooks. Use `useRef` instead so the reference lifecycle matches the component lifecycle.

## Type-only imports for dynamic modules

Use `import type { X }` when you need types from a module that's dynamically imported at runtime (`await import(...)`). This avoids eager bundling while keeping type safety.

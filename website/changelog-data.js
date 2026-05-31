/**
 * Condensed changelog for the website.
 * Patches are merged into their minor version. Noise entries
 * (downloads.json, activity log, merge commits, empty releases) are filtered.
 */
export const CHANGELOG_DATA = [
  {
    version: 'v0.63.0',
    date: '2026-06-01',
    latest: true,
    sections: {
      Features: [
        'Mac-native UX pass: floating sidebar card, warm dark theme (#1C1C1E bg, #28282A elevated panels)',
        'Bear-inspired shell with rounded sidebar that wraps the traffic-light row',
        'Inline /model and /agent quick-swap pickers above the composer',
        'Per-file Viewed checkbox in diff viewer with N/M progress strip',
        'Right-rail Agent Summary panel beside diff hunks (collapsed by default)',
        'Diff keyboard navigation: j/k file, a all, s stage, r revert, o editor, v viewed, [ sidebar',
        'Worktree-dirty indicator: amber triangle in app header, opens diff on click',
        'Browser-style thread history backed by navHistory store (Cmd+[ / Cmd+] shortcuts)',
        'Inline file-path and branch tokens in agent prose (clickable, open in editor)',
        'Cold-open command palette seeds recent threads + recent slash commands',
        'Route "Open in Terminal" through the built-in terminal',
        'Remote branch checkout and branch name sanitization for /branch',
      ],
      'Bug fixes': [
        'Fix bundle identifier mismatch (com.kirodex.dev → com.kirodex.app) that broke v0.61.0 Gatekeeper signing',
        'Hide action buttons until hover instead of showing at low opacity (calmer sidebar)',
        'Prevent empty project names on import',
        'Stop gitignore from excluding components/diff/SelectionToolbar',
        'Allow empty branch in vcs_status test for detached HEAD',
        'Swap /model for /branch in slash-action panel test (model is now pass-through)',
      ],
      Refactoring: [
        'Remove goal feature and refactor diff theme CSS (goal autonomous loop dropped)',
        'Codex-calm thread row: softer active bg, time stamp always visible, trash overlays on hover without layout shift',
        'Segmented Scope control in Add MCP server dialog (wider dialog, label-only cells, mono path tooltip)',
        'Sidebar footer slimmed to single kebab + connection dot; version moved into menu',
        'KiroConfigPanel nested rails softened to border-border/30',
        'Timeline stability: TurnChip stripped to minimal Rollback affordance',
        'Project icons drop colored tints; status indicator unified to shape variants (spin/half/ring/x)',
        'Drop hard borders on sidebar — separation via bg color shift only',
      ],
      Styling: [
        'Warmer dark theme: --background #0D0D0D → #1C1C1E, --card/--sidebar → #28282A',
        'Softer off-white text (--foreground → #E4E4E6)',
        'AppHeader border softened to border-border/40',
        'Show project action icons only on hover (calmer rows)',
        'Active project no longer paints a bg pill; only font-medium bump on name',
        'Symmetric p-3 outer inset so sidebar reads as elevated floating card',
        'Traffic-light row baseline-aligned with NavHistoryButtons and collapse chrome',
      ],
    },
  },
  {
    version: 'v0.53.0',
    date: '2026-05-17',
    sections: {
      Features: [
        '/goal autonomous agent loop with orchestrator, templates, and analytics',
        'Split-view context menu with swap, replace, and remove actions',
        'Project dropdown, useMenuPosition hook, and viewport-aware menus',
        'Selection toolbar: insert into chat or start new thread from selection',
        'Running thread spinner replaces pulse dot in sidebar',
      ],
      Styling: [
        'Highlight active thread item in sidebar',
        'Darken diff stats colors for light mode contrast',
      ],
    },
  },
  {
    version: 'v0.49.0',
    date: '2026-05-12',
    sections: {
      Features: [
        'KiroGhostIcon component for branding',
        'Expanded emoji picker, favicon name hiding, and queue message editing',
        'Persist UI state every 30s and add connection_lost system message',
        'Onboarding login errors and non-standard path hint',
        'Unsaved changes confirmation dialog in settings',
        'Delete button for memory section thread rows',
        'Open File Tree from project context menu',
        'Add memory monitoring and lazy-load archived threads',
        'Auto-refresh config when .kiro files change on disk',
        'Add GLM, Qwen, and MiniMax model provider icons',
        'File tree panel, MCP server management, drag-drop to chat',
      ],
      'Bug fixes': [
        'Fix clipped unmodified lines separator in diff view',
        'Hide archived banner when message is initiated',
        'Improve chat UX and fix git diff output',
        'Preserve existing tool call fields during merge',
        'Strip base64 image data from title/branch prompts',
        'Render image preview overlay via portal',
        'Support full paths in terminal command allowlist',
        'Skip redundant flush on relaunch to prevent hang',
        'Path traversal, SSRF, AppleScript injection, and NSOpenPanel crash fixes',
        'Robust JSON parsing for kiro-cli warnings and improve persistence',
        'Prevent PTY cwd bypass via unset HOME on Windows',
      ],
      Styling: [
        'Restyle nav sidebar with full-height layout',
        'Restyle toolbar as connected button group',
        'Darken border and sidebar colors',
        'Refine split divider grip dots and panel header layout',
        'Rename "split view" to "side-by-side" across UI',
      ],
      Refactoring: [
        'Add memo, useCallback, and tooltips to all settings sections',
        'Make sidebar full height, move header into content column',
        'Restyle footer with inline buttons and user menu',
        'Extract ProjectGroup in deleted threads restore',
        'Replace material-icon-theme with seti-file-icons',
      ],
      Performance: [
        'Wrap SettingRow and SettingsCard in memo',
        'Lazy Shiki, inline tool calls, sticky task list, connection state',
        'Connection health monitor with exponential backoff',
        'Normalized selectors, dual-stream sidebar pattern',
        'Stable timeline rows, logic/UI separation, structural equality',
      ],
      Tests: [
        'Comprehensive test coverage for performance modules',
      ],
    },
  },
  {
    version: 'v0.39.0',
    date: '2026-04-27',
    sections: {
      Features: [
        'Persistent sidebar badges until thread visited',
        'Clone from GitHub dialog and git_clone command',
        "What's New dialog for post-upgrade highlights",
        'Webview zoom level limits (50%-100%)',
        'Blue dot indicator for pending questions',
        'Cleaning review card component',
      ],
      'Bug fixes': [
        'Move question cards to bottom of message for visibility',
        'Clear notification badges on focus without switching threads',
      ],
    },
  },
  {
    version: 'v0.38.0',
    date: '2026-04-26',
    sections: {
      Features: [
        'Per-panel state, fix split close, thread ordering, perf audit',
        'Slash command mode tracking and estimated token cost',
      ],
      'Bug fixes': [
        'Fix z-index conflict with settings panel',
      ],
    },
  },
  {
    version: 'v0.37.0',
    date: '2026-04-26',
    sections: {
      Features: [
        'Light, dark, and system theme toggle',
        'Always-visible close button on right split panel',
        'Thread pinning to keep important conversations at the top',
      ],
      'Bug fixes': [
        'Show permission requests inside /btw overlay',
      ],
      Refactoring: [
        'Replace toast notification with Radix Dialog modal',
      ],
      Tests: [
        'Add BtwOverlay component tests',
      ],
    },
  },
  {
    version: 'v0.36.0',
    date: '2026-04-25',
    sections: {
      Features: [
        'Split-screen view — two threads side by side with Cmd+\\',
        'Drag-to-reorder projects and Cmd+N project jumping',
        'Git init support for non-git projects',
        'Toolbar toggle, thread picker, and context menu split options',
      ],
      'Bug fixes': [
        'Deactivate split on thread click and set 50:50 ratio',
      ],
      Styling: [
        'Container queries for compact toolbar and polish spacing',
      ],
      Tests: [
        'Add split view and scroll position unit tests',
      ],
    },
  },
  {
    version: 'v0.35.0',
    date: '2026-04-25',
    sections: {
      Features: [
        'Custom app icon and compact two-column layout',
        'Smart OS-detecting download cards with GitHub API fetch',
      ],
      'Bug fixes': [
        'Deduplicate update notification and style Sonner toasts',
      ],
    },
  },
  {
    version: 'v0.34.0',
    date: '2026-04-24',
    sections: {
      Features: [
        'Error state with shake animation and retry button',
        'Replace /btw lightning bolt with message-circle-question icon',
        'Replace wrench icon with zap for skills; show "skill: Name" in pills',
      ],
      'Bug fixes': [
        'Detect fullscreen mode and adjust traffic light padding',
        'Fix ToolCallDisplay layout for nested TaskList/Subagent cards',
        'Move working indicator dot above tool calls in timeline',
      ],
      Refactoring: [
        'Upgrade Kbd component with KbdGroup and tooltip-aware styling',
        'Replace plan toggle button with explicit mode dropdown',
        'Rewrite AutoApproveToggle as dropdown with explicit labels',
      ],
    },
  },
  {
    version: 'v0.33.x',
    date: '2026-04-24',
    sections: {
      Features: [
        'Folder drag-drop pills through ChatInput and PillsRow',
        'Working row streaming indicator and dev/prod icon split',
      ],
      'Bug fixes': [
        'Reconnect restored threads after soft-delete',
        'Improve crash fallback with close button and timer cleanup',
        'Remove overflow-hidden that clipped question card options',
        'Improve skill mention pill text contrast',
        'Show working indicator during long tool calls',
        'Match dev and prod icon sizing and spacing',
      ],
      Styling: [
        'Redesign app icons from square to squircle shape',
      ],
    },
  },
  {
    version: 'v0.32.0',
    date: '2026-04-23',
    sections: {
      'Bug fixes': [
        'Remove openssl dynamic linking dependency',
      ],
    },
  },
  {
    version: 'v0.31.0',
    date: '2026-04-23',
    sections: {
      Documentation: [
        'Fix first-contribution onboarding — thanks @chriscao99',
      ],
    },
  },
  {
    version: 'v0.30.0',
    date: '2026-04-23',
    sections: {
      Features: [
        'Crash recovery UI and corrupted store detection',
        'Improve project item and task sidebar',
      ],
    },
  },
  {
    version: 'v0.28.0',
    date: '2026-04-22',
    sections: {
      Features: [
        'Overhaul settings panel UI/UX',
      ],
      'Bug fixes': [
        'Add missing persistHistory calls, ack-based quit flush, warn on failures',
        'Persist history after removeProject/archiveThreads and fix merge mutation',
        'Preserve live tasks when loadTasks is called mid-session',
      ],
      Tests: [
        'Add tests for live task preservation during loadTasks',
      ],
    },
  },
  {
    version: 'v0.27.0',
    date: '2026-04-22',
    sections: {
      'Bug fixes': [
        'Preserve image attachments in steering queue',
        'Resolve orphaned UUID project entries on re-add',
      ],
    },
  },
  {
    version: 'v0.26.0',
    date: '2026-04-21',
    sections: {
      'Bug fixes': [
        'Fix state not persisting across restarts',
      ],
    },
  },
  {
    version: 'v0.25.0',
    date: '2026-04-21',
    sections: {
      'Bug fixes': [
        'Fix "Restart now" button silently failing',
      ],
    },
  },
  {
    version: 'v0.17.0',
    date: '2026-04-21',
    sections: {
      Features: [
        'Recent projects menu and UI state persistence across restarts',
        'Add Copy Path to project context menu',
      ],
      'Bug fixes': [
        'Use separate store file for dev builds',
        'Render completion card for all valid reports, not just file changes',
        'Set working directory when spawning kiro-cli subprocess',
      ],
    },
  },
  {
    version: 'v0.16.x',
    date: '2026-04-21',
    sections: {
      Features: [
        'Multi-window support and native File menu commands',
      ],
      'Bug fixes': [
        'Bypass quit confirmation dialog on relaunch',
        'Retain file/agent/skill mentions in draft threads on switch',
        'Persist draft attachments and pasted chunks across thread switches',
      ],
      Refactoring: [
        'Replace git2 remote callbacks with git CLI for network ops',
      ],
    },
  },
  {
    version: 'v0.15.0',
    date: '2026-04-21',
    sections: {
      Features: [
        'Open external links in OS default browser',
        'Active project focus indicator',
      ],
      'Bug fixes': [
        'Resolve whitespace gaps, scroll jank, and steering duplication',
        'Restore soft-deleted threads when re-importing project — thanks @kvginnovate',
      ],
    },
  },
  {
    version: 'v0.14.0',
    date: '2026-04-19',
    sections: {
      Features: [
        'Icon overrides, auth fallback, history backup, subagent display',
        'Analytics dashboard with redb backend and Recharts',
      ],
    },
  },
  {
    version: 'v0.13.0',
    date: '2026-04-18',
    sections: {
      Features: [
        'Local branch delete in branch selector',
        'Emoji icon picker and improved /btw overlay',
        'Render strReplace tool calls as git-style diffs',
        'Tooltip on worktree icons in sidebar and header',
      ],
      'Bug fixes': [
        'Raise paste placeholder threshold to 100 words / 10 lines',
        'Improve Show more button visibility and increase collapse threshold',
        'Add missing /fork command and fix restoreTask assertion',
        'Send images as proper ContentBlock::Image',
        'Ignore Escape key when terminal is focused',
      ],
    },
  },
  {
    version: 'v0.12.0',
    date: '2026-04-18',
    sections: {
      Features: [
        'Link commit hashes to GitHub in release notes',
        'Workspace diff support and commit input',
        'Commit message generation utils with tests',
        'Stage button icon swap feedback and staged count in toolbar',
        '"Created" sort option as default',
        'Expand open_in_editor with terminal emulators and cross-platform support',
      ],
      'Bug fixes': [
        'Merge staged and unstaged diffs to avoid double-counting',
      ],
      Refactoring: [
        'Split taskStore into types, listeners, and core modules',
        'Extract DiffViewer, kiro config, settings, onboarding, AppHeader, and chat sub-components',
        'Split monolithic acp.rs into modular subfiles',
        'Migrate std::sync::Mutex to parking_lot',
      ],
    },
  },
  {
    version: 'v0.11.0',
    date: '2026-04-16',
    sections: {
      Features: [
        'Features section and brew install terminal block on website',
        'Adopt minimal website',
      ],
      'Bug fixes': [
        'Auto-retry on refusal and improved error display',
        'Friendly error messages for model permission and access errors',
      ],
    },
  },
  {
    version: 'v0.10.x',
    date: '2026-04-16',
    sections: {
      Features: [
        'Cross-platform support for Windows and Linux',
        'Overhaul title bar with native traffic light repositioning',
      ],
      'Bug fixes': [
        'Use bg-background instead of bg-card for dark mode consistency',
      ],
      Styling: [
        'Change primary color from indigo to blue-500',
        'Unify system message rows to muted inline style',
      ],
    },
  },
  {
    version: 'v0.9.x',
    date: '2026-04-15',
    sections: {
      Features: [
        'Git worktree support with /branch and /worktree commands',
        'Worktree-aware sidebar grouping, workspace sync, and project identity',
        'JS Debug tab with console, error, network, and Rust log capture',
        'Full landing page content, changelog, and deploy workflow',
        'Plan-aware context compaction',
        'Inline rename for project and thread breadcrumbs',
        'Cmd+Shift+V for raw paste without placeholder',
      ],
      'Bug fixes': [
        'Friendly errors, worktree lock UI, force checkout',
        'Remove error fallback, improve update dot, enable devtools',
      ],
      Styling: [
        'Lighter palette, bigger fonts, blue icon branding',
      ],
    },
  },
  {
    version: 'v0.8.x',
    date: '2026-04-14',
    sections: {
      Features: [
        'Onboarding v2 with privacy toggle and 3-step platform install flow',
        'Recently Deleted section with soft-delete thread recovery',
        'Provider-specific icons in model picker',
        'Notification system rewrite with queue and debounce',
        'Cmd+F message search with highlighting',
        'Restart prompt dialog and sidebar update indicator',
        'Empty thread splash screen with mid-sentence slash and mention support',
        'Fuzzy search across slash commands, agent, and model panels',
        'Agent mention pills with built-in agents and styled icons',
        'Plan agent handoff card and plan-mode preprompt',
        'Code viewer for read tool calls',
        'Fork session and collapsible chat input',
        '/usage slash command for token usage panel',
        'Auto-generate grouped release notes from commits',
        'Navigate to correct thread on notification click',
      ],
      'Bug fixes': [
        'Handle refusal stop reason and finalize tool calls on turn end',
        'Prevent message area layout overlap with multiple messages',
        'Replace oklch and Tailwind color vars with concrete hex values',
        'Resolve message list layout overlap from stale virtualizer measurements',
        'Improve X close button UX in dropdown panels',
        'Refresh git branch name on window focus',
        'Send /agent command on mode switch and make plan mode per-thread',
        'Last task in task list never shown as completed',
      ],
      Styling: [
        'Complete Linear/Codex-inspired colour overhaul and sidebar density upgrade',
        'Improve light/dark mode contrast for CSS tokens',
        'Bump base font to 14px and UI polish',
      ],
      Refactoring: [
        'Replace virtualizer with plain DOM flow in MessageList',
        'Move RecentlyDeleted from sidebar to SettingsPanel',
      ],
      Tests: [
        'Improve frontend test coverage across stores, lib, hooks, and components',
      ],
    },
  },
]

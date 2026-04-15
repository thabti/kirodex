# Changelog

## [v0.8.15] - 2026-04-15

### Features

- add inline rename for project and thread breadcrumbs

## [v0.8.14] - 2026-04-15

### Features

- upgrade to onboarding v2 with privacy toggle
- add Recently Deleted section with soft-delete thread recovery
- combine completion report card with changed files summary
- add provider-specific icons to model picker
- redesign into 3-step flow with platform install commands
- rewrite notification system with queue and debounce
- add Cmd+F message search with highlighting
- add light/dark/system theme support
- add restart prompt dialog and sidebar update indicator

### Bug fixes

- make task_fork async and add parent_task_id to Task

### Styling

- improve light mode contrast and add dark mode color variants
- improve light/dark mode contrast for CSS tokens
- bump base font to 14px, light mode fixes, and UI polish

### Refactoring

- move RecentlyDeleted from sidebar to SettingsPanel

### Documentation

- update activity log with commit review session
- update README features and refresh screenshots

### CI

- add update-downloads workflow

### Tests

- improve frontend test coverage across stores, lib, hooks, and components
- add unit tests for 0.8.13 changes and About dialog

## [v0.8.13] - 2026-04-15

### Features

- wire up fork_session and add collapsible chat input
- forward compaction status notification to frontend
- add X close button to FileMentionPicker
- add X close button to SlashPanels dropdown
- add /usage slash command for token usage panel
- redesign plan mode question cards for better approachability

### Bug fixes

- improve X close button UX in dropdown panels
- resolve message list layout overlap from stale virtualizer measurements
- prevent empty tasks array from skipping completed_task_ids

### Styling

- improve answered questions UI

### Refactoring

- replace virtualizer with plain DOM flow in MessageList

### Documentation

- update activity log
- update activity log
- update activity log

## [v0.8.12] - 2026-04-14

### Features

- add empty thread splash screen with mid-sentence slash and mention support
- add fuzzy search to slash commands and agent/model panels
- extract fuzzy search util and apply to @ mention picker
- enhance agent mention pills with built-in agents and styled icons
- archive threads on /close and show .kiro agents in /agent panel
- add archiveTask action to taskStore
- add built-in agent picker to /agent slash panel
- increase check frequency and add sidebar badge
- add plan agent handoff card
- extract question parser, harden edge cases, add plan-mode preprompt
- ChatInput UX improvements — focus ring, send transition, collapsible pills, tests
- add code viewer for read tool calls

### Bug fixes

- resolve unused variable warning and failing settings test
- refresh git branch name on window focus
- remove stale question_format placeholder from full_prompt
- send /agent command on mode switch and make plan mode per-thread
- require all questions answered before submit and default answers expanded
- check rawInput for completed_task_ids in task list aggregation
- last task in task list never shown as completed
- replace oklch and Tailwind color vars with concrete hex values
- remove inner focus ring from ChatInput textarea

### Styling

- improve ChatInput background color and border width
- use #2c2e35 background for chat input and user message bubble
- complete Linear/Codex-inspired colour overhaul and sidebar density upgrade
- color loading text by mode — blue default, teal planning

### Documentation

- update activity log with agent mention pill changes
- update activity log
- update activity log

## [v0.8.11] - 2026-04-14

### Features

- navigate to correct thread on notification click
- ChatInput UX improvements
- auto-generate grouped release notes from commits
- default analyticsEnabled to true
- ghost placeholders when no project is open, swap auth icon

### Bug fixes

- handle refusal stop reason and finalize tool calls on turn end
- prevent message area layout overlap with multiple messages
- harden layout, fix scroll-to-bottom positioning and hover, add word-break
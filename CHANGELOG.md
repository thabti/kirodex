# Changelog

## [v0.26.0] - 2026-04-21

### Bug fixes

- fix state not persisting across restarts ([`fb235c2`](https://github.com/thabti/kirodex/commit/fb235c20e29b5affd3cc1b911a8488e9e9958b5b))

## [v0.25.0] - 2026-04-21

### Bug fixes

- fix "Restart now" button silently failing ([`4a22d88`](https://github.com/thabti/kirodex/commit/4a22d88cd5de3d513b521e82cbafd30c3615bf52))

## [v0.17.0] - 2026-04-21

### Features

- recent projects menu and UI state persistence across restarts ([`e91f0c6`](https://github.com/thabti/kirodex/commit/e91f0c6ce3a96f5f3215699b373c562b2c4f694e))
- add Copy Path to project context menu ([`c92ca7f`](https://github.com/thabti/kirodex/commit/c92ca7ffc42f7323568fc3816c7b57b13dbc3460))

### Bug fixes

- use separate store file for dev builds ([`240b96e`](https://github.com/thabti/kirodex/commit/240b96edd53ee0bd1c050213828525f9dd50abed))
- render completion card for all valid reports, not just file changes ([`c2430dd`](https://github.com/thabti/kirodex/commit/c2430dd5fdc00cd70364f886d294075a3e239bcc))
- set working directory when spawning kiro-cli subprocess ([`bb63034`](https://github.com/thabti/kirodex/commit/bb630348967dadb8a0a0ca335e9220e33ed8401d))

## [v0.16.1] - 2026-04-21

### Bug fixes

- bypass quit confirmation dialog on relaunch ([`8ee1659`](https://github.com/thabti/kirodex/commit/8ee1659ea27d81b73c7706f730bbac4a635bfa2e))

## [v0.16.0] - 2026-04-21

### Features

- add multi-window support and native File menu commands ([`90db6f0`](https://github.com/thabti/kirodex/commit/90db6f0e543c60765823c6305771787a2f95d27f))

### Bug fixes

- remove redundant file header from diff panel ([`40557ef`](https://github.com/thabti/kirodex/commit/40557ef6f620a09bdc89eddd6f43d7c87d8cc29c))
- retain file/agent/skill mentions in draft threads on switch ([`7ec8fc1`](https://github.com/thabti/kirodex/commit/7ec8fc1740e6ed3aa4697bf63633bfbb11fefb88))
- persist draft attachments and pasted chunks across thread switches ([`e9410e2`](https://github.com/thabti/kirodex/commit/e9410e2ed1be091bd8bfef87768b08c229f2369c))
- align applyTurnEnd and timeline tests with implementation [skip ci] ([`45e3884`](https://github.com/thabti/kirodex/commit/45e3884b5a5732561d06cb464fec971db11cc4a6))

### Refactoring

- replace git2 remote callbacks with git CLI for network ops ([`4812906`](https://github.com/thabti/kirodex/commit/481290631278f69e46abb47cc1379ea255e38e9c))

## [v0.15.0] - 2026-04-21

### Features

- open external links in OS default browser ([`e5fc335`](https://github.com/thabti/kirodex/commit/e5fc335a35ab6bb8fc7ebcebef7c4b0fd5c53fc9))
- add active project focus indicator ([`9e1c055`](https://github.com/thabti/kirodex/commit/9e1c05510c277e9ec9f5ec85e9376d3ada105f95))

### Bug fixes

- resolve whitespace gaps, scroll jank, and steering duplication ([`7b10772`](https://github.com/thabti/kirodex/commit/7b10772e7b32491653debe7c1951881f231ec29d))
- restore soft-deleted threads when re-importing project (#18) ([`7f7350b`](https://github.com/thabti/kirodex/commit/7f7350be1c44da48973c49606abc29fa9f1bb0b4)) — thanks @kvginnovate

### Chores

- update downloads.json ([`904b2d9`](https://github.com/thabti/kirodex/commit/904b2d96fd1318232253a975459d3c34d7eacfa5))
- update downloads.json ([`de2b581`](https://github.com/thabti/kirodex/commit/de2b58162d84f56aaaaa4ba6420882a9566e9585))
- update downloads.json ([`df89a19`](https://github.com/thabti/kirodex/commit/df89a19bfaae616db91bad20c6143ecb27e79651))

### Other changes

- Merge branch 'main' of github.com:thabti/kirodex ([`03608bc`](https://github.com/thabti/kirodex/commit/03608bc0bfea3b045a925e4aec21cb02380feb84))

## [v0.14.0] - 2026-04-19

### Features

- icon overrides, auth fallback, collapsible removal, history backup, subagent display ([`2b6d71b`](https://github.com/thabti/kirodex/commit/2b6d71bca205c6610c6efb8f3b2006f5a15a46bf))
- add analytics dashboard with redb backend and recharts ([`4b12592`](https://github.com/thabti/kirodex/commit/4b12592e884ee96f829fc16ba2df5f63a40a7025))

### Documentation

- add inline diffs, image attachments, commit generation features ([`ef6a284`](https://github.com/thabti/kirodex/commit/ef6a284bf03de66b33c4cfcb8da73cdd8c7f0df1))

## [v0.13.0] - 2026-04-18

### Features

- add local branch delete to branch selector ([`2ea4ced`](https://github.com/thabti/kirodex/commit/2ea4ced34c6656fb10e4ad5219fc5b38114e93d5))
- add emoji icon picker and improve btw overlay ([`d094b49`](https://github.com/thabti/kirodex/commit/d094b494e6894263d00f6808f1a1fa4da2779221))
- render strReplace tool calls as git-style diffs ([`ff4daca`](https://github.com/thabti/kirodex/commit/ff4dacaa6fe8a036e36afd2301205528d864482d))
- add tooltip to worktree icons in sidebar and header ([`3cbe1ed`](https://github.com/thabti/kirodex/commit/3cbe1ed4c22e2f89073f0d389e3fe14708732c4f))

### Bug fixes

- raise paste placeholder threshold to 100 words / 10 lines ([`efcea1c`](https://github.com/thabti/kirodex/commit/efcea1c02138e32ab086aeab14bdaa0f7643413e))
- improve Show more button visibility and increase collapse threshold ([`cdec0c2`](https://github.com/thabti/kirodex/commit/cdec0c26c58d9c4ccb3f3bc14750f8eeb21db164))
- add missing /fork command and fix restoreTask assertion ([`869aeea`](https://github.com/thabti/kirodex/commit/869aeea99055870438cdb5c9b9ef642a93a42b39))
- send images as proper ContentBlock::Image (#14) ([`0a2a5f9`](https://github.com/thabti/kirodex/commit/0a2a5f92e21a05783205c3bef5927cb60c48a6ab))
- ignore Escape key when terminal is focused ([`8934ec3`](https://github.com/thabti/kirodex/commit/8934ec32ad9e8b4e22f9f231b8c5e0d1b7a74e3a))
- show all project image files in file tab ([`4d437c8`](https://github.com/thabti/kirodex/commit/4d437c8cb3fad90915ffd40298cb715df1739863))
- include features.html in website deployment ([`de58e75`](https://github.com/thabti/kirodex/commit/de58e752ae9ffc357ee8eccf8991102fd722d246))
- render markdown links in changelog page ([`944ced6`](https://github.com/thabti/kirodex/commit/944ced6ce88e88b673723ff9c398ea95ae20e388))
- type ipcMock.setAutoApprove with explicit signature ([`98927c8`](https://github.com/thabti/kirodex/commit/98927c83946c595045f132b56859a5cd76aa259f))

### Styling

- improve delete button hover UX ([`f363a0d`](https://github.com/thabti/kirodex/commit/f363a0da6b3873d2c0ceb83ac42dbe2653c54d5c))

### CI

- flatten artifact paths to just .dmg and .exe ([`57f9337`](https://github.com/thabti/kirodex/commit/57f9337b2715f5d243b5fc9bc0d15a145286d172))
- add label-triggered PR build workflow (#16) ([`6d0faac`](https://github.com/thabti/kirodex/commit/6d0faac6d6b2b5f88c4e569d8ce474647b5b7c8a))
- add label-triggered PR build workflow for DMG and EXE ([`54e71a1`](https://github.com/thabti/kirodex/commit/54e71a191e9fa568ca2c671848cc48722c4a4010))

### Chores

- update downloads.json ([`5b05992`](https://github.com/thabti/kirodex/commit/5b05992ddc65f24b281d69c28535e43ac6f736b0))
- update downloads.json ([`72f21a4`](https://github.com/thabti/kirodex/commit/72f21a49ca68f77e23c2d2e38a78ee4539fc669e))

### Other changes

- merge: integrate remote changes with local CI workflow ([`4f94292`](https://github.com/thabti/kirodex/commit/4f9429247cc88d294068d38a9ab39e06ad16b14a))
- activity update ([`8a12288`](https://github.com/thabti/kirodex/commit/8a122885b0ef7becd6388ba63eb00494c1191670))
- erge branch 'main' of github.com:thabti/kirodex ([`78f9e81`](https://github.com/thabti/kirodex/commit/78f9e816cb54945a56ea50361f2afc7b08e818b9))

## [v0.12.0] - 2026-04-18

### Features

- link commit hashes to GitHub in release notes ([`8075333`](https://github.com/thabti/kirodex/commit/807533344773aa9434e2bf80030be656fe89f4ea))
- workspace diff support and commit input ([`abeaeb5`](https://github.com/thabti/kirodex/commit/abeaeb5d7e28299cb577b084b19b2b24a2df8fe4))
- add commit message generation utils with tests ([`dbd3341`](https://github.com/thabti/kirodex/commit/dbd334165e2a35af9b9e3c796dd2dfa82b2b4350))
- stage button icon swap feedback and staged count in toolbar ([`4197010`](https://github.com/thabti/kirodex/commit/4197010e9e7e77a48174bed1b897ac88d95b5fe7))
- add 'created' sort option as default ([`b8f33a3`](https://github.com/thabti/kirodex/commit/b8f33a369c6559408d1707f50bc9fc8dc4c1bfef))
- expand open_in_editor with terminal emulators and cross-platform support ([`852ee96`](https://github.com/thabti/kirodex/commit/852ee963a649137796ccc1083efb1e5baf1d6b5c))
- add useProjectIcon, extend useSlashAction and useChatInput ([`348536d`](https://github.com/thabti/kirodex/commit/348536d0515013470ba0b301ec7e833f0e5e9815))
- replace xterm.js with ghostty-web WASM terminal ([`72faa70`](https://github.com/thabti/kirodex/commit/72faa702858e24abeb61b85a206507b167b835d1))
- add Kiro ghost logo and sponsored-by Lastline to hero ([`35b43fd`](https://github.com/thabti/kirodex/commit/35b43fddb19093897b56a8d1337fc9737949fd11))

### Bug fixes

- merge staged and unstaged diffs to avoid double-counting ([`1722664`](https://github.com/thabti/kirodex/commit/17226644222421ee593a9533f0e1a26f994d5610))

### Refactoring

- split taskStore into types, listeners, and core modules ([`4f81d87`](https://github.com/thabti/kirodex/commit/4f81d87434ff4c013484dff8f5eef6526de889b2))
- extract DiffViewer sub-components and utilities ([`896ad0d`](https://github.com/thabti/kirodex/commit/896ad0d3364e3af5ce0a59f139b669b3762f438c))
- extract kiro config sub-components and add project icon picker ([`57c3250`](https://github.com/thabti/kirodex/commit/57c3250d2dc3fbfe5e932fa81226bba72d508e6e))
- extract settings sections into individual modules ([`d196e59`](https://github.com/thabti/kirodex/commit/d196e593f9e2227e707a98137781189b0dc94eec))
- extract onboarding step components from monolithic Onboarding.tsx ([`b464d8a`](https://github.com/thabti/kirodex/commit/b464d8ac8148daf6b44ea14c896df9000d0a7f34))
- split AppHeader into breadcrumb, toolbar, and user-menu modules ([`daec3c8`](https://github.com/thabti/kirodex/commit/daec3c894fc3fff5cfa0040d82d543116d1611ec))
- extract chat sub-components from monolithic files ([`1dd5e51`](https://github.com/thabti/kirodex/commit/1dd5e516ac36310c354e051349910b0783a0a21f))
- migrate std::sync::Mutex to parking_lot ([`039183c`](https://github.com/thabti/kirodex/commit/039183cecf9af8d15235a87f2dff2bf300030cb4))
- split monolithic acp.rs into modular subfiles ([`a4973fe`](https://github.com/thabti/kirodex/commit/a4973fe929ed33a79de41726de841e555a8557c7))

### Documentation

- update activity log with session entries ([`216eb40`](https://github.com/thabti/kirodex/commit/216eb401c956037e6a4eef7e5abc19dca5ac7ba1))
- add IPC reference, keyboard shortcuts, slash commands, and security audits ([`58a6fc4`](https://github.com/thabti/kirodex/commit/58a6fc4b1973e3e1e0b8dc9b8182eb25277ec2aa))
- update main screenshot ([`823b82b`](https://github.com/thabti/kirodex/commit/823b82bf895817f28d57d2400cd6720f2b204c7d))

### Chores

- update activity logs, plans, website, and build config ([`c3600d6`](https://github.com/thabti/kirodex/commit/c3600d63d1a50b669f38e38116608cdd6d4fe7ae))

## [v0.11.0] - 2026-04-16

### Features

- add features section and brew install terminal block
- adopt minimal website (#13)

### Bug fixes

- auto-retry on refusal and improved error display
- friendly error messages for model errors and filter agent-switch noise
- friendly error messages for model permission and access errors

### Documentation

- update activity log
- update activity log

### Chores

- update downloads.json

## [v0.10.1] - 2026-04-16

### Features

- add cross-platform support for Windows and Linux

### Styling

- unify system message rows to muted inline style

## [v0.10.0] - 2026-04-16

### Features

- overhaul title bar with native traffic light repositioning

### Bug fixes

- use bg-background instead of bg-card for dark mode consistency

### Styling

- change primary color from indigo to blue-500

## [v0.9.2] - 2026-04-16

### Features

- detect worktree-locked branches and add force checkout
- force checkout option and worktree branch locking
- show confirmation dialog before deleting worktree threads
- worktree-aware workspace sync and pink theme token
- worktree-aware sidebar grouping and input improvements
- worktree-aware components and terminal improvements
- workspace sandbox for ACP and worktree validation
- worktree-aware project identity and per-project config caching
- worktree support in utils, timeline, and history-store
- add projectId field to AgentTask
- support Cmd+Shift+V for raw paste without placeholder

### Bug fixes

- friendly errors, worktree lock UI, force checkout

### Documentation

- update activity log
- log worktree confirmation dialog session in activity.md
- log commit organization session in activity.md
- update activity logs
- add CLAUDE.md for analytics service

### Chores

- add slugify and xterm-addon-web-links
- remove kirodex-rules steering file

## [v0.9.1] - 2026-04-15

### Bug fixes

- remove error fallback, improve update dot, enable devtools (#12)

### Styling

- lighter palette, performance hero, blue icon branding
- bigger fonts, lighter palette, blue production icon

### Documentation

- add performance stats badges
- add 7 engineering learnings from session

## [v0.9.0] - 2026-04-15

### Features

- add threadName and projectName to JsDebugEntry
- add full landing page content, changelog, and deploy workflow
- add thread and project filtering to JS Debug tab
- add landing page with screenshots and Tailwind styling
- add git worktree support with /branch and /worktree commands
- add JS Debug tab with console, error, network, and Rust log capture
- plan-aware context compaction

### Bug fixes

- make local dev work and use blue production icon
- prevent bun test from running vitest files without jsdom
- stamp threadName/projectName on JS debug entries

### Documentation

- update activity log with website and changelog entries

### Tests

- suppress console.warn stderr noise in dismissVersion test

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
## 2025-06-02 13:59 GST (Dubai)

### Memory: Fix 5 memory leaks causing macOS unresponsiveness

Implemented all 5 fixes identified in the memory audit:
1. Capped `deletedTaskIds` at 500 entries (FIFO eviction) across all 6 mutation sites
2. Rust `task_cancel` now removes tasks from `AcpState.tasks` HashMap after status emit
3. Capped `softDeleted` at 50 entries (oldest evicted) across all 3 build-up sites
4. Watchdog interval now prunes orphaned `lastActivityMs`/`refusalRetried` entries every 10s
5. Window focus handler bulk-clears `notifiedTaskIds` instead of being a no-op

**Modified:** src/renderer/stores/taskStore.ts, src/renderer/stores/task-store-listeners.ts, src/renderer/App.tsx, src-tauri/src/commands/acp/commands.rs

---

## 2025-06-02 13:53 GST (Dubai)

### Memory: Full memory leak and unresponsiveness audit

Comprehensive review of Rust backend and React frontend for memory leaks causing macOS unresponsiveness. Identified 5 critical issues: unbounded `deletedTaskIds` Set, Rust `AcpState.tasks` HashMap retaining cancelled tasks, `softDeleted` holding full task objects for 48h, leaked `lastActivityMs`/`refusalRetried` records in listener closures, and unbounded `notifiedTaskIds` array. Proposed targeted fixes for each.

**Modified:** activity.md (created)

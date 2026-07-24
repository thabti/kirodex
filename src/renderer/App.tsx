import { useEffect, useCallback, useState, useRef, lazy, Suspense } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { applyTheme, listenSystemTheme, persistTheme } from "@/lib/theme";
import { preloadHighlighterIdle } from "@/lib/chatHighlighter";
import { warmTerminalRuntime } from "@/components/chat/TerminalDrawer";
import { startConnectionHealthMonitor } from "@/lib/connection-health";
import { getReceiptBus } from "@/lib/typed-receipts";
import { AppHeader } from "@/components/AppHeader";
import { TaskSidebar } from "@/components/sidebar/TaskSidebar";

const IS_MAC = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac')
const ChatPanel = lazy(() =>
  import("@/components/chat/ChatPanel").then((m) => ({ default: m.ChatPanel })),
);
const SplitChatLayout = lazy(() =>
  import("@/components/chat/SplitChatLayout").then((m) => ({ default: m.SplitChatLayout })),
);
import { PendingChat } from "@/components/chat/PendingChat";
import { NewProjectSheet } from "@/components/task/NewProjectSheet";
import { ipc } from "@/lib/ipc";
const SettingsPanel = lazy(() =>
  import("@/components/settings/SettingsPanel").then((m) => ({
    default: m.SettingsPanel,
  })),
);
const CodePanel = lazy(() =>
  import("@/components/code/CodePanel").then((m) => ({ default: m.CodePanel })),
);
const DebugPanel = lazy(() =>
  import("@/components/debug/DebugPanel").then((m) => ({
    default: m.DebugPanel,
  })),
);
const FileTreePanel = lazy(() =>
  import("@/components/file-tree/FileTreePanel").then((m) => ({
    default: m.FileTreePanel,
  })),
);
const AnalyticsDashboard = lazy(() =>
  import("@/components/analytics/AnalyticsDashboard").then((m) => ({
    default: m.AnalyticsDashboard,
  })),
);
import { useTaskStore, initTaskListeners } from "@/stores/taskStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useDebugStore } from "@/stores/debugStore";
import { useDiffStore } from "@/stores/diffStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useKiroStore, initKiroListeners } from "@/stores/kiroStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { useZoomLimit } from "@/hooks/useZoomLimit";
import { UpdateAvailableDialog } from "@/components/UpdateAvailableDialog";
import { WhatsNewDialog } from "@/components/WhatsNewDialog";
import { CHANGELOG, isNewerVersion } from "@/lib/changelog";
import type { ChangelogEntry } from "@/lib/changelog";
import { useUpdateStore } from "@/stores/updateStore";
import { startAutoFlush, stopAutoFlush } from "@/lib/analytics-collector";
import { WorktreeCleanupDialog } from "@/components/sidebar/WorktreeCleanupDialog";
import { CloneRepoDialog } from "@/components/CloneRepoDialog";
import { GlobalFilePreviewModal } from "@/components/GlobalFilePreviewModal";
import { getRuntimeVersion, isTauriRuntime } from "@/lib/web-rpc";
import {
  initAnalytics,
  resetAnalytics,
  makeAnonId,
  readLastVersion,
  writeLastVersion,
} from "@/lib/analytics";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import {
  IconStack2,
  IconPlus,
  IconFolderOpen,
  IconLayoutColumns,
  IconArrowsShuffle,
  IconGitBranch,
  IconTerminal2,
  IconMessageChatbot,
  IconGitCompare,
} from "@tabler/icons-react";
const Onboarding = lazy(() =>
  import("@/components/Onboarding").then((m) => ({ default: m.Onboarding })),
);

function LoginBanner() {
  const kiroAuth = useSettingsStore((s) => s.kiroAuth);
  const kiroAuthChecked = useSettingsStore((s) => s.kiroAuthChecked);
  const openLogin = useSettingsStore((s) => s.openLogin);

  if (!kiroAuthChecked || kiroAuth) return null;

  return (
    <div className="mx-auto mb-3 flex w-full max-w-2xl items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 lg:max-w-3xl xl:max-w-4xl">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-amber-400" aria-hidden>
        <path d="M8 1.333A6.667 6.667 0 1 0 14.667 8 6.674 6.674 0 0 0 8 1.333Zm0 10.334a.667.667 0 1 1 0-1.334.667.667 0 0 1 0 1.334ZM8.667 8a.667.667 0 0 1-1.334 0V5.333a.667.667 0 0 1 1.334 0V8Z" fill="currentColor"/>
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-amber-700 dark:text-amber-200/90">Sign in to Kiro to start using AI agents</p>
        <p className="text-[11px] text-amber-600/70 dark:text-amber-400">Authentication is required to create threads and interact with agents</p>
      </div>
      <button
        type="button"
        onClick={openLogin}
        className="shrink-0 rounded-lg bg-amber-500/20 px-3 py-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-200 transition-colors hover:bg-amber-500/30"
      >
        Sign in
      </button>
    </div>
  );
}

const SHOWCASE_FEATURES = [
  {
    icon: IconLayoutColumns,
    label: "Side-by-side",
    description: "Two threads side by side",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: IconArrowsShuffle,
    label: "Spin threads",
    description: "Fork and branch conversations",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
  },
  {
    icon: IconGitBranch,
    label: "Git worktrees",
    description: "Isolate each thread in its own branch",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    icon: IconGitCompare,
    label: "Inline diffs",
    description: "Syntax-highlighted code changes",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  {
    icon: IconTerminal2,
    label: "Built-in terminal",
    description: "Run commands without leaving the app",
    color: "text-pink-400",
    bgColor: "bg-pink-500/10",
  },
  {
    icon: IconMessageChatbot,
    label: "Slash commands",
    description: "/plan, /fork, /btw, /worktree and more",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
  },
] as const;

function EmptyState() {
  const projects = useTaskStore((s) => s.projects);
  const hasProjects = projects.length > 0;

  const handleNew = useCallback(() => {
    if (projects.length > 0) {
      useTaskStore.getState().setPendingWorkspace(projects[0]);
    } else {
      useTaskStore.getState().setNewProjectOpen(true);
    }
  }, [projects]);

  return (
    <div data-testid="empty-state" className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 overflow-y-auto">
      <div className="flex flex-col items-center gap-5 -mt-4 max-w-lg w-full">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <IconStack2 size={28} stroke={1.5} className="text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">
            {hasProjects ? "Start a new thread" : "Open a project to get started"}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {hasProjects
              ? "Pick a project and start chatting with Kiro"
              : "Point Kirodex at any folder on your machine. The AI agent works directly with your files, runs commands, and helps you build."}
          </p>
        </div>
        <LoginBanner />
        <button
          type="button"
          onClick={handleNew}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {hasProjects ? (
            <>
              <IconPlus size={15} stroke={2} />
              New Thread
            </>
          ) : (
            <>
              <IconFolderOpen size={15} stroke={1.5} />
              Import Project
            </>
          )}
        </button>
        {!hasProjects && (
          <p className="text-[11px] text-muted-foreground">
            Or press <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘O</kbd> to open a folder
          </p>
        )}

        {/* Features showcase */}
        <div className="mt-4 w-full" role="region" aria-label="Features overview">
          <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
            What you can do
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SHOWCASE_FEATURES.map((feature) => (
              <div
                key={feature.label}
                className="group flex items-start gap-3 rounded-xl border border-border/50 bg-card/50 px-3.5 py-3 transition-colors hover:border-border hover:bg-card"
              >
                <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", feature.bgColor)}>
                  <feature.icon size={16} stroke={1.5} className={cn(feature.color, "transition-transform group-hover:scale-110")} />
                </div>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-foreground/90">{feature.label}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Navigate to a task from a clicked notification, then remove it from the queue. */
const navigateToNotifiedTask = (taskId: string): void => {
  const store = useTaskStore.getState()
  if (!store.tasks[taskId]) return
  // If the task is already visible in the active split, just focus that panel
  if (store.activeSplitId) {
    const sv = store.splitViews.find((v) => v.id === store.activeSplitId)
    if (sv && (sv.left === taskId || sv.right === taskId)) {
      const panel = sv.left === taskId ? 'left' as const : 'right' as const
      store.setFocusedPanel(panel)
      useTaskStore.setState((s) => ({
        selectedTaskId: taskId,
        notifiedTaskIds: s.notifiedTaskIds.filter((id) => id !== taskId),
      }))
      store.setView('chat')
      return
    }
  }
  store.setSelectedTask(taskId)
  store.setView('chat')
  useTaskStore.setState((s) => ({
    notifiedTaskIds: s.notifiedTaskIds.filter((id) => id !== taskId),
  }))
}

export function App() {
  const { view, selectedTaskId, pendingWorkspace, activeSplitId } = useTaskStore(
    useShallow((s) => ({
      view: s.view,
      selectedTaskId: s.selectedTaskId,
      pendingWorkspace: s.pendingWorkspace,
      activeSplitId: s.activeSplitId,
    })),
  );
  const debugOpen = useDebugStore((s) => s.isOpen);
  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const hasOnboardedV2 = useSettingsStore((s) => s.settings.hasOnboardedV2);
  const analyticsEnabled = useSettingsStore((s) => s.settings.analyticsEnabled ?? true);
  const analyticsAnonId = useSettingsStore((s) => s.settings.analyticsAnonId ?? null);
  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  const chatFontSize = useSettingsStore((s) => s.settings.chatFontSize);
  const theme = useSettingsStore((s) => s.settings.theme ?? 'dark');
  const sidebarPosition = useSettingsStore((s) => s.settings.sidebarPosition ?? 'left');
  const isRightSidebar = sidebarPosition === 'right';
  const isUpdateDialogActive = useUpdateStore((s) => s.status !== 'idle');
  useKeyboardShortcuts();
  useSessionTracker();
  useZoomLimit();

  // Apply font size from settings to the document root.
  // This sets the html element's font-size which cascades through all rem-based
  // sizing in the app. The CSS variable is kept for components that need it directly.
  useEffect(() => {
    const size = fontSize ?? 13;
    document.documentElement.style.setProperty('--app-font-size', `${size}px`);
    document.documentElement.style.fontSize = `${size}px`;
  }, [fontSize]);

  // Apply chat font size as a CSS var. Falls back to UI font size so users on
  // existing settings (no chatFontSize key) keep current behavior.
  useEffect(() => {
    const resolved = chatFontSize ?? fontSize ?? 15;
    document.documentElement.style.setProperty('--chat-font-size', `${resolved}px`);
  }, [chatFontSize, fontSize]);

  // Apply theme and listen for OS preference changes (for 'system' mode)
  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
    if (theme !== 'system') return
    return listenSystemTheme(() => applyTheme('system'))
  }, [theme]);

  // Warm the chat code-block highlighter in the background so the first
  // fenced code block doesn't pay the full Shiki cold-start cost. The
  // returned cleanup cancels the idle callback if App unmounts before it
  // runs (effectively never, but kept for correctness).
  useEffect(() => preloadHighlighterIdle(), []);

  // Pre-warm the terminal WASM runtime (ghostty-web + WebAssembly.compile)
  // during idle time so the first "Open in Terminal" doesn't pay the cold-start.
  useEffect(() => { warmTerminalRuntime() }, []);

  // Sync active workspace → apply per-project model/autoApprove prefs
  useEffect(() => {
    const tasks = useTaskStore.getState().tasks;
    const task = selectedTaskId ? tasks[selectedTaskId] : null;
    // activeWorkspace = project root (for prefs lookup), operationalWorkspace = actual cwd (worktree path if applicable)
    const workspace = task
      ? (task.originalWorkspace ?? task.workspace)
      : pendingWorkspace;
    const operationalWs = task ? task.workspace : pendingWorkspace;
    useSettingsStore.getState().setActiveWorkspace(workspace, operationalWs);
    // Reset mode to default when entering a new/pending thread (no selectedTaskId)
    if (!selectedTaskId) {
      useSettingsStore.setState({ currentModeId: 'kiro_default' });
    }
  }, [selectedTaskId, pendingWorkspace]);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
  const [whatsNewEntry, setWhatsNewEntry] = useState<ChangelogEntry | null>(null);

  // Refs to expose current values to the flush-before-quit event listener
  const sidePanelOpenRef = useRef(sidePanelOpen);
  sidePanelOpenRef.current = sidePanelOpen;
  const sidebarCollapsedRef = useRef(isSidebarCollapsed);
  sidebarCollapsedRef.current = isSidebarCollapsed;

  // Sync diffStore.isOpen → sidePanelOpen (for openToFile)
  // Note: sidePanelOpen intentionally excluded from deps — we only react to diffIsOpen changes
  const diffIsOpen = useDiffStore((s) => s.isOpen);
  useEffect(() => {
    if (diffIsOpen && !sidePanelOpen) setSidePanelOpen(true);
    if (diffIsOpen) useFileTreeStore.getState().setOpen(false);
  }, [diffIsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync fileTreeStore.isOpen → sidePanelOpen
  // Note: sidePanelOpen intentionally excluded from deps — we only react to fileTreeIsOpen changes
  const fileTreeIsOpen = useFileTreeStore((s) => s.isOpen);
  useEffect(() => {
    if (fileTreeIsOpen && !sidePanelOpen) setSidePanelOpen(true);
  }, [fileTreeIsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const sync = () => {
      setIsMobileViewport(query.matches)
      if (!query.matches) setIsMobileSidebarOpen(false)
    }
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    useTaskStore.getState().loadTasks().then(() => {
      useTaskStore.getState().purgeExpiredSoftDeletes();
      useTaskStore.getState().autoArchiveStaleThreads();
      // Initialize VCS status for all known projects
      import('@/stores/vcsStatusStore').then(({ initVcsStatus }) => {
        const projects = useTaskStore.getState().projects
        initVcsStatus(projects)
      }).catch((e) => {
        if (import.meta.env.DEV) console.warn('[App] vcsStatusStore init failed:', e)
      })
      // Restore persisted UI state (selected thread, view, panels)
      import('@/lib/history-store').then(({ loadUiState }) => {
        loadUiState().then((ui) => {
          if (!ui) return
          const state = useTaskStore.getState()
          const tasks = state.tasks
          const archivedMeta = state.archivedMeta
          if (ui.selectedTaskId && (tasks[ui.selectedTaskId] || archivedMeta[ui.selectedTaskId])) {
            state.setSelectedTask(ui.selectedTaskId)
            const validViews = ['chat', 'dashboard', 'analytics'] as const
            if (validViews.includes(ui.view as typeof validViews[number])) {
              state.setView(ui.view as typeof validViews[number])
            }
          }
          setSidePanelOpen(ui.sidePanelOpen ?? false)
          setIsSidebarCollapsed(ui.sidebarCollapsed ?? false)
          // Restore split views
          if (ui.splitViews && ui.splitViews.length > 0) {
            const validSplits = ui.splitViews.filter((sv) => tasks[sv.left] && tasks[sv.right])
            if (validSplits.length > 0) {
              useTaskStore.setState({ splitViews: validSplits })
              if (ui.activeSplitId && validSplits.some((sv) => sv.id === ui.activeSplitId)) {
                useTaskStore.getState().setActiveSplit(ui.activeSplitId)
              }
            }
          }
          // Restore pinned threads
          if (ui.pinnedThreadIds && ui.pinnedThreadIds.length > 0) {
            const validPins = ui.pinnedThreadIds.filter((id) => tasks[id])
            if (validPins.length > 0) {
              useTaskStore.setState({ pinnedThreadIds: validPins })
            }
          }
          // Restore per-thread model and mode selections so picks survive
          // restart. Filter to known task ids to avoid leaking entries from
          // deleted threads.
          if (ui.taskModels) {
            const validModels: Record<string, string> = {}
            for (const [tid, mid] of Object.entries(ui.taskModels)) {
              if (tasks[tid] || archivedMeta[tid]) validModels[tid] = mid
            }
            if (Object.keys(validModels).length > 0) {
              useTaskStore.setState({ taskModels: validModels })
            }
          }
          if (ui.taskModes) {
            const validModes: Record<string, string> = {}
            for (const [tid, m] of Object.entries(ui.taskModes)) {
              if (tasks[tid] || archivedMeta[tid]) validModes[tid] = m
            }
            if (Object.keys(validModes).length > 0) {
              useTaskStore.setState({ taskModes: validModes })
            }
          }
        }).catch(() => {})
      })
    });
    useSettingsStore.getState().loadSettings().then(() => {
      useSettingsStore.getState().checkAuth();
      // Apply custom dock icon if set
      const { customAppIcon } = useSettingsStore.getState().settings;
      if (customAppIcon) {
        const base64 = customAppIcon.replace(/^data:[^;]+;base64,/, '');
        ipc.setDockIcon(base64).catch(() => {});
      }
    });
    // Pre-warm ACP to get models/modes before user creates a thread
    ipc.probeCapabilities().catch(() => {});
    // Purge expired soft-deleted threads every hour
    const purgeInterval = setInterval(() => {
      useTaskStore.getState().purgeExpiredSoftDeletes();
    }, 60 * 60 * 1000);
    // Auto-save thread history every 30s as a safety net
    const autoSaveInterval = setInterval(() => {
      useTaskStore.getState().persistHistory()
      useTaskStore.getState().persistUiState()
    }, 30_000);
    // Request notification permission so end_turn alerts work
    if (isTauriRuntime()) {
      import("@tauri-apps/plugin-notification").then(({ isPermissionGranted, requestPermission, onAction }) => {
        isPermissionGranted().then((granted) => {
          if (!granted) requestPermission();
        });
        // Navigate to the task when user clicks a notification
        onAction((notification) => {
          const tid = (notification as { extra?: Record<string, unknown> }).extra?.taskId as string | undefined;
          if (tid) navigateToNotifiedTask(tid);
        }).catch(() => {});
      }).catch(() => {});
    }
    // Clear notification badges when the user returns to the app — if they
    // can see the window, they don't need attention indicators anymore.
    const handleWindowFocus = () => {
      const { notifiedTaskIds } = useTaskStore.getState()
      if (notifiedTaskIds.length > 0) {
        useTaskStore.setState({ notifiedTaskIds: [] })
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    const cleanupTask = initTaskListeners();
    const cleanupKiro = initKiroListeners();
    // Begin probing the kiro-cli subprocess so we can show "reconnecting…"
    // banners and clear stale latency entries on disconnect.
    const cleanupHealth = startConnectionHealthMonitor();
    // When a `diff.ready` receipt is published (after `turn_end`), refresh
    // the diff panel if it's open. This replaces the old pattern of polling
    // `gitDiffStats` from the panel itself.
    const unsubDiffReceipt = getReceiptBus().subscribe('diff.ready', (receipt) => {
      const diffStore = useDiffStore.getState()
      if (diffStore.isOpen) {
        void diffStore.fetchDiff(receipt.taskId)
      }
    });
    startAutoFlush();
    // Listen for native menu events
    let unlistenNewThread: (() => void) | null = null
    let unlistenNewProject: (() => void) | null = null
    let unlistenRecentProject: (() => void) | null = null
    let unlistenFlushBeforeQuit: (() => void) | null = null
    let unlistenCloneFromGithub: (() => void) | null = null
    if (isTauriRuntime()) import('@tauri-apps/api/event').then(({ listen }) => {
      // Rust emits this right before app.exit(0) — flush all state to disk
      listen('app://flush-before-quit', () => {
        useTaskStore.getState().persistHistory()
        import('@/lib/history-store').then((hs) => {
          const { selectedTaskId, view, splitViews, activeSplitId, pinnedThreadIds, taskModels, taskModes } = useTaskStore.getState()
          hs.saveUiState({
            selectedTaskId,
            view,
            sidePanelOpen: sidePanelOpenRef.current,
            sidebarCollapsed: sidebarCollapsedRef.current,
            splitViews,
            activeSplitId,
            pinnedThreadIds,
            taskModels,
            taskModes,
          }).catch(() => {})
          hs.flush().then(() => {
            // Ack the flush so Rust can proceed with shutdown
            import('@tauri-apps/api/event').then(({ emit }) => {
              emit('app://flush-ack').catch(() => {})
            })
          }).catch(() => {
            // Ack even on failure so Rust doesn't hang
            import('@tauri-apps/api/event').then(({ emit }) => {
              emit('app://flush-ack').catch(() => {})
            })
          })
        }).catch(() => {
          import('@tauri-apps/api/event').then(({ emit }) => {
            emit('app://flush-ack').catch(() => {})
          })
        })
      }).then((fn) => { unlistenFlushBeforeQuit = fn })
      listen('menu-new-thread', () => {
        const state = useTaskStore.getState()
        const task = state.selectedTaskId ? state.tasks[state.selectedTaskId] : null
        const workspace = task
          ? (task.originalWorkspace ?? task.workspace)
          : state.projects[0]
        if (workspace) {
          state.setPendingWorkspace(workspace)
        }
      }).then((fn) => { unlistenNewThread = fn })
      listen('menu-new-project', () => {
        useTaskStore.getState().setNewProjectOpen(true)
      }).then((fn) => { unlistenNewProject = fn })
      listen<string>('menu-open-recent-project', (event) => {
        const path = event.payload
        if (!path) return
        const state = useTaskStore.getState()
        state.addProject(path)
        state.setPendingWorkspace(path)
      }).then((fn) => { unlistenRecentProject = fn })
      listen('menu-clone-from-github', () => {
        setIsCloneDialogOpen(true)
      }).then((fn) => { unlistenCloneFromGithub = fn })
    })
    // Cross-window state sync — reload when another window persists changes
    let unsubSync: (() => void) | null = null
    let syncDebounce: ReturnType<typeof setTimeout> | null = null
    import('@/lib/history-store').then(({ subscribeToChanges, isSelfWriting }) => {
      // Skip sync reloads when:
      // 1. This window wrote the change (isSelfWriting) — avoids reloading our own saves
      // 2. This window has live ACP sessions — loadTasks would overwrite running/paused tasks
      const shouldSkipSync = () => isSelfWriting() || Object.values(useTaskStore.getState().tasks).some(
        (t) => t.status === 'running' || t.status === 'paused',
      )
      const handleChange = () => {
        if (shouldSkipSync()) return
        if (syncDebounce) clearTimeout(syncDebounce)
        syncDebounce = setTimeout(() => {
          useTaskStore.getState().loadTasks()
        }, 300)
      }
      subscribeToChanges(handleChange, handleChange).then((fn) => { unsubSync = fn })
    })
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      clearInterval(purgeInterval);
      clearInterval(autoSaveInterval);
      stopAutoFlush();
      cleanupTask();
      cleanupKiro();
      cleanupHealth();
      unsubDiffReceipt();
      if (unlistenNewThread) unlistenNewThread()
      if (unlistenNewProject) unlistenNewProject()
      if (unlistenRecentProject) unlistenRecentProject()
      if (unlistenFlushBeforeQuit) unlistenFlushBeforeQuit()
      if (unlistenCloneFromGithub) unlistenCloneFromGithub()
      if (unsubSync) unsubSync()
      if (syncDebounce) clearTimeout(syncDebounce)
    };
  }, []);

  // selection-new-thread: open new pending chat in the same workspace, pre-filled with the selection
  useEffect(() => {
    const h = (e: Event) => {
      const { text, workspace } = (e as CustomEvent<{ text: string; workspace?: string | null }>).detail ?? {}
      if (!text) return
      const state = useTaskStore.getState()
      const ws = workspace ?? state.projects[0]
      if (!ws) return
      state.setPendingWorkspace(ws)
      // After the pending chat mounts it listens for splash-insert
      requestAnimationFrame(() => {
        document.dispatchEvent(new CustomEvent('splash-insert', { detail: text }))
      })
    }
    document.addEventListener('selection-new-thread', h)
    return () => document.removeEventListener('selection-new-thread', h)
  }, [])

  // Wire PostHog once settings are loaded; re-run on opt-in/opt-out toggles.
  useEffect(() => {
    if (!settingsLoaded) return;
    if (!analyticsEnabled) {
      resetAnalytics();
      return;
    }

    const { settings, saveSettings } = useSettingsStore.getState();
    let distinctId = analyticsAnonId;
    // Lazily mint an anonymous id on first opt-in and persist it.
    if (!distinctId) {
      distinctId = makeAnonId();
      saveSettings({ ...settings, analyticsAnonId: distinctId }).catch(() => {});
    }

    const previousVersion = readLastVersion();
    initAnalytics({
      enabled: true,
      distinctId,
      previousVersion,
    }).then((ok) => {
      if (ok) {
        getRuntimeVersion().then((v) => writeLastVersion(v)).catch(() => {});
      }
    });
  }, [settingsLoaded, analyticsEnabled, analyticsAnonId]);

  // Show "What's New" dialog once after a version upgrade.
  useEffect(() => {
    if (!settingsLoaded) return;
    getRuntimeVersion().then((currentVersion) => {
      const { settings, saveSettings } = useSettingsStore.getState();
      const lastSeen = settings.lastSeenChangelogVersion;
      // Fresh install — seed the version silently, don't show dialog
      if (!lastSeen) {
        saveSettings({ ...settings, lastSeenChangelogVersion: currentVersion }).catch(() => {});
        return;
      }
      // Only show if current version is strictly newer than last seen
      if (!isNewerVersion(currentVersion, lastSeen)) return;
      // Find a matching entry, or fall back to the newest entry newer than lastSeen
      const entry = CHANGELOG.find((e) => e.version === currentVersion)
        ?? CHANGELOG.find((e) => isNewerVersion(e.version, lastSeen));
      if (entry) {
        setWhatsNewEntry(entry);
      } else {
        // No entry found — still update lastSeen so we don't re-check every launch
        saveSettings({ ...settings, lastSeenChangelogVersion: currentVersion }).catch(() => {});
      }
    }).catch(() => {});
  }, [settingsLoaded]);

  // ⌘B keyboard shortcut to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        if (isMobileViewport) {
          setIsMobileSidebarOpen((v) => !v);
        } else {
          setIsSidebarCollapsed((v) => !v);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileViewport]);

  const toggleSidePanel = useCallback(() => {
    setSidePanelOpen((prev) => {
      if (prev) {
        useDiffStore.getState().setOpen(false)
        useFileTreeStore.getState().setOpen(false)
      }
      return !prev
    })
  }, [])
  const closeSidePanel = useCallback(() => {
    setSidePanelOpen(false)
    useDiffStore.getState().setOpen(false)
    useFileTreeStore.getState().setOpen(false)
  }, [])
  const toggleSidebar = useCallback(() => {
    if (isMobileViewport) {
      setIsMobileSidebarOpen((v) => !v)
      return
    }
    setIsSidebarCollapsed((v) => !v)
  }, [isMobileViewport]);
  const closeMobileSidebar = useCallback(() => setIsMobileSidebarOpen(false), [])

  const handleWhatsNewDismiss = useCallback(() => {
    setWhatsNewEntry(null);
    getRuntimeVersion().then((v) => {
      const { settings, saveSettings } = useSettingsStore.getState();
      saveSettings({ ...settings, lastSeenChangelogVersion: v }).catch(() => {});
    }).catch(() => {});
  }, []);

  if (settingsLoaded && !hasOnboardedV2)
    return (
      <Suspense>
        <Onboarding />
      </Suspense>
    );

  return (
    <TooltipProvider delayDuration={300}>
      <div data-testid="app-container" className="flex h-full gap-0 bg-background text-foreground sm:gap-3 sm:p-3">
        {/* Sidebar — desktop column, mobile drawer */}
        <ErrorBoundary>
          {!isMobileViewport && !isSidebarCollapsed && (
            <TaskSidebar
              width={sidebarWidth}
              onResize={setSidebarWidth}
              position={sidebarPosition}
              onCollapse={toggleSidebar}
              onCloneFromGitHub={() => setIsCloneDialogOpen(true)}
            />
          )}
          {isMobileViewport && isMobileSidebarOpen && (
            <div className="fixed inset-0 z-[180] sm:hidden">
              <button
                type="button"
                aria-label="Close navigation"
                className="absolute inset-0 bg-background/70 backdrop-blur-sm"
                onClick={closeMobileSidebar}
              />
              <div className="absolute inset-y-0 left-0 w-[min(88vw,360px)] p-2">
                <TaskSidebar
                  width={Math.min(window.innerWidth * 0.88, 360)}
                  onResize={setSidebarWidth}
                  position="left"
                  onCollapse={closeMobileSidebar}
                  onNavigate={closeMobileSidebar}
                  onCloneFromGitHub={() => {
                    closeMobileSidebar()
                    setIsCloneDialogOpen(true)
                  }}
                  isMobileOverlay
                />
              </div>
            </div>
          )}
        </ErrorBoundary>

        {/* Right column: header + content */}
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", isRightSidebar && "order-first")}>
          {/* Top-level breadcrumb header */}
          <ErrorBoundary>
            <AppHeader
              sidePanelOpen={sidePanelOpen}
              onToggleSidePanel={toggleSidePanel}
              isSidebarCollapsed={isMobileViewport || isSidebarCollapsed}
              onToggleSidebar={toggleSidebar}
              sidebarPosition={sidebarPosition}
            />
          </ErrorBoundary>

          {/* Main area: content + side panel */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <main data-testid="main-content" className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <ErrorBoundary>
              <div
                className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                style={{ fontSize: 'var(--app-font-size, 13px)' }}
              >
                <Suspense>
                  {view === 'analytics' ? (
                    <AnalyticsDashboard />
                  ) : selectedTaskId && activeSplitId ? (
                    <SplitChatLayout />
                  ) : selectedTaskId ? (
                    <ChatPanel />
                  ) : pendingWorkspace ? (
                    <PendingChat key={pendingWorkspace} workspace={pendingWorkspace} />
                  ) : (
                    <EmptyState />
                  )}
                </Suspense>
              </div>
            </ErrorBoundary>
            {sidePanelOpen && !activeSplitId && (selectedTaskId || pendingWorkspace) && (
              <ErrorBoundary>
                <Suspense>
                  <div className={cn(isMobileViewport ? 'fixed inset-x-0 bottom-0 top-[44px] z-[160] bg-background' : 'contents')}>
                    {fileTreeIsOpen ? (
                      <FileTreePanel onClose={closeSidePanel} workspace={pendingWorkspace ?? undefined} />
                    ) : (
                      <CodePanel onClose={closeSidePanel} workspace={pendingWorkspace ?? undefined} />
                    )}
                  </div>
                </Suspense>
              </ErrorBoundary>
            )}
          </main>
          </div>

          {/* Bottom debug panel */}
          {debugOpen && (
            <ErrorBoundary>
              <Suspense>
                <DebugPanel />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      </div>
      <ErrorBoundary>
        <NewProjectSheet />
      </ErrorBoundary>
      <ErrorBoundary>
        <Suspense>
          <SettingsPanel />
        </Suspense>
      </ErrorBoundary>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 8000,
          classNames: {
            toast: 'sonner-toast',
            title: 'sonner-title',
            description: 'sonner-description',
            actionButton: 'sonner-action',
          },
        }}
        theme="dark"
      />
      <UpdateAvailableDialog />
      <WorktreeCleanupDialog />
      <CloneRepoDialog open={isCloneDialogOpen} onOpenChange={setIsCloneDialogOpen} />
      <ErrorBoundary>
        <GlobalFilePreviewModal />
      </ErrorBoundary>
      {whatsNewEntry && !isUpdateDialogActive && (
        <WhatsNewDialog open={!!whatsNewEntry} entry={whatsNewEntry} onDismiss={handleWhatsNewDismiss} />
      )}
    </TooltipProvider>
  );
}

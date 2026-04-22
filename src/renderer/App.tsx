import { useEffect, useCallback, useState, useRef, lazy, Suspense } from "react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { applyTheme, listenSystemTheme, persistTheme } from "@/lib/theme";
import { AppHeader } from "@/components/AppHeader";
import { TaskSidebar } from "@/components/sidebar/TaskSidebar";
const ChatPanel = lazy(() =>
  import("@/components/chat/ChatPanel").then((m) => ({ default: m.ChatPanel })),
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
const AnalyticsDashboard = lazy(() =>
  import("@/components/analytics/AnalyticsDashboard").then((m) => ({
    default: m.AnalyticsDashboard,
  })),
);
import { useTaskStore, initTaskListeners } from "@/stores/taskStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useDebugStore } from "@/stores/debugStore";
import { useDiffStore } from "@/stores/diffStore";
import { useKiroStore, initKiroListeners } from "@/stores/kiroStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUpdateChecker } from "@/hooks/useUpdateChecker";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { startAutoFlush, stopAutoFlush } from "@/lib/analytics-collector";
import { RestartPromptDialog } from "@/components/sidebar/RestartPromptDialog";
import { WorktreeCleanupDialog } from "@/components/sidebar/WorktreeCleanupDialog";
import { getVersion } from "@tauri-apps/api/app";
import {
  initAnalytics,
  resetAnalytics,
  makeAnonId,
  readLastVersion,
  writeLastVersion,
} from "@/lib/analytics";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { IconStack2, IconPlus, IconFolderOpen } from "@tabler/icons-react";
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
    <div data-testid="empty-state" className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-5 -mt-12 max-w-sm">
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
            Or press <kbd className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">⌘O</kbd> to open a folder
          </p>
        )}
      </div>
    </div>
  );
}

function UpdateNotifier() {
  const { status, updateInfo, progress, dismissedVersion, downloadAndInstall, restart, dismissVersion } = useUpdateChecker();
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (status === 'available' && updateInfo) {
      if (dismissedVersion === updateInfo.version) return;
      toastIdRef.current = toast(`Kirodex v${updateInfo.version} available`, {
        description: 'A new version is ready to install.',
        duration: Infinity,
        action: {
          label: 'Update now',
          onClick: () => downloadAndInstall(),
        },
        onDismiss: () => dismissVersion(updateInfo.version),
      });
    }

    if (status === 'downloading') {
      const pct = progress?.total
        ? Math.round((progress.downloaded / progress.total) * 100)
        : null;
      const desc = pct !== null ? `Downloading... ${pct}%` : 'Downloading...';
      if (toastIdRef.current) {
        toast.loading(desc, { id: toastIdRef.current, duration: Infinity });
      } else {
        toastIdRef.current = toast.loading(desc, { duration: Infinity });
      }
    }

    if (status === 'ready') {
      if (toastIdRef.current) {
        toast.success('Update installed', {
          id: toastIdRef.current,
          description: 'Restart to finish updating.',
          duration: Infinity,
          action: {
            label: 'Restart',
            onClick: () => restart(),
          },
        });
      }
    }

    if (status === 'error') {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    }
  }, [status, progress?.downloaded]);

  return null;
}

/** Navigate to a task from a clicked notification, then remove it from the queue. */
const navigateToNotifiedTask = (taskId: string): void => {
  const store = useTaskStore.getState()
  if (!store.tasks[taskId]) return
  store.setSelectedTask(taskId)
  store.setView('chat')
  useTaskStore.setState((s) => ({
    notifiedTaskIds: s.notifiedTaskIds.filter((id) => id !== taskId),
  }))
}

export function App() {
  const { view, selectedTaskId, pendingWorkspace } = useTaskStore(
    useShallow((s) => ({
      view: s.view,
      selectedTaskId: s.selectedTaskId,
      pendingWorkspace: s.pendingWorkspace,
    })),
  );
  const debugOpen = useDebugStore((s) => s.isOpen);
  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const hasOnboardedV2 = useSettingsStore((s) => s.settings.hasOnboardedV2);
  const analyticsEnabled = useSettingsStore((s) => s.settings.analyticsEnabled ?? true);
  const analyticsAnonId = useSettingsStore((s) => s.settings.analyticsAnonId ?? null);
  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  const theme = useSettingsStore((s) => s.settings.theme ?? 'dark');
  const sidebarPosition = useSettingsStore((s) => s.settings.sidebarPosition ?? 'left');
  const isRightSidebar = sidebarPosition === 'right';
  useKeyboardShortcuts();
  useSessionTracker();

  // Apply font size from settings to the document root
  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-size', `${fontSize ?? 13}px`);
  }, [fontSize]);

  // Apply theme and listen for OS preference changes (for 'system' mode)
  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
    if (theme !== 'system') return
    return listenSystemTheme(() => applyTheme('system'))
  }, [theme]);

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

  // Refs to expose current values to the flush-before-quit event listener
  const sidePanelOpenRef = useRef(sidePanelOpen);
  sidePanelOpenRef.current = sidePanelOpen;
  const sidebarCollapsedRef = useRef(isSidebarCollapsed);
  sidebarCollapsedRef.current = isSidebarCollapsed;

  // Sync diffStore.isOpen → sidePanelOpen (for openToFile)
  const diffIsOpen = useDiffStore((s) => s.isOpen);
  useEffect(() => {
    if (diffIsOpen && !sidePanelOpen) setSidePanelOpen(true);
  }, [diffIsOpen]);

  useEffect(() => {
    useTaskStore.getState().loadTasks().then(() => {
      useTaskStore.getState().purgeExpiredSoftDeletes();
      // Restore persisted UI state (selected thread, view, panels)
      import('@/lib/history-store').then(({ loadUiState }) => {
        loadUiState().then((ui) => {
          if (!ui) return
          const tasks = useTaskStore.getState().tasks
          if (ui.selectedTaskId && tasks[ui.selectedTaskId]) {
            useTaskStore.getState().setSelectedTask(ui.selectedTaskId)
            const validViews = ['chat', 'dashboard', 'analytics'] as const
            if (validViews.includes(ui.view as typeof validViews[number])) {
              useTaskStore.getState().setView(ui.view as typeof validViews[number])
            }
          }
          setSidePanelOpen(ui.sidePanelOpen ?? false)
          setIsSidebarCollapsed(ui.sidebarCollapsed ?? false)
        }).catch(() => {})
      })
    });
    useSettingsStore.getState().loadSettings().then(() => {
      useSettingsStore.getState().checkAuth();
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
    }, 30_000);
    // Request notification permission so end_turn alerts work
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
    // Fallback: navigate on window focus if notifications were pending
    const handleWindowFocus = () => {
      const ids = useTaskStore.getState().notifiedTaskIds
      if (ids.length > 0) navigateToNotifiedTask(ids[ids.length - 1])
    };
    window.addEventListener("focus", handleWindowFocus);
    const cleanupTask = initTaskListeners();
    const cleanupKiro = initKiroListeners();
    startAutoFlush();
    // Listen for native menu events
    let unlistenNewThread: (() => void) | null = null
    let unlistenNewProject: (() => void) | null = null
    let unlistenRecentProject: (() => void) | null = null
    let unlistenFlushBeforeQuit: (() => void) | null = null
    import('@tauri-apps/api/event').then(({ listen }) => {
      // Rust emits this right before app.exit(0) — flush all state to disk
      listen('app://flush-before-quit', () => {
        useTaskStore.getState().persistHistory()
        import('@/lib/history-store').then((hs) => {
          const { selectedTaskId, view } = useTaskStore.getState()
          hs.saveUiState({
            selectedTaskId,
            view,
            sidePanelOpen: sidePanelOpenRef.current,
            sidebarCollapsed: sidebarCollapsedRef.current,
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
      if (unlistenNewThread) unlistenNewThread()
      if (unlistenNewProject) unlistenNewProject()
      if (unlistenRecentProject) unlistenRecentProject()
      if (unlistenFlushBeforeQuit) unlistenFlushBeforeQuit()
      if (unsubSync) unsubSync()
      if (syncDebounce) clearTimeout(syncDebounce)
    };
  }, []);

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
        getVersion().then((v) => writeLastVersion(v)).catch(() => {});
      }
    });
  }, [settingsLoaded, analyticsEnabled, analyticsAnonId]);

  // ⌘B keyboard shortcut to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setIsSidebarCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleSidePanel = useCallback(() => {
    setSidePanelOpen((prev) => {
      if (prev) useDiffStore.getState().setOpen(false)
      return !prev
    })
  }, [])
  const closeSidePanel = useCallback(() => {
    setSidePanelOpen(false)
    useDiffStore.getState().setOpen(false)
  }, [])
  const toggleSidebar = useCallback(() => setIsSidebarCollapsed((v) => !v), []);

  if (settingsLoaded && !hasOnboardedV2)
    return (
      <Suspense>
        <Onboarding />
      </Suspense>
    );

  return (
    <TooltipProvider delayDuration={300}>
      <div data-testid="app-container" className="flex h-full flex-col bg-background text-foreground">
        {/* Top-level breadcrumb header */}
        <ErrorBoundary>
          <AppHeader
            sidePanelOpen={sidePanelOpen}
            onToggleSidePanel={toggleSidePanel}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            sidebarPosition={sidebarPosition}
          />
        </ErrorBoundary>

        {/* Main area: sidebar + content + side panel */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary>
            {!isSidebarCollapsed && <TaskSidebar width={sidebarWidth} onResize={setSidebarWidth} position={sidebarPosition} />}
          </ErrorBoundary>
          <main data-testid="main-content" className={cn('flex min-h-0 min-w-0 flex-1 overflow-hidden', isRightSidebar && 'order-first')}>
            <ErrorBoundary>
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl" style={{ fontSize: 'var(--app-font-size, 14px)' }}>
                <Suspense>
                  {view === 'analytics' ? (
                    <AnalyticsDashboard />
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
            {sidePanelOpen && (selectedTaskId || pendingWorkspace) && (
              <ErrorBoundary>
                <Suspense>
                  <CodePanel onClose={closeSidePanel} workspace={pendingWorkspace ?? undefined} />
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
        toastOptions={{ duration: 8000 }}
        theme="system"
      />
      <UpdateNotifier />
      <RestartPromptDialog />
      <WorktreeCleanupDialog />
    </TooltipProvider>
  );
}

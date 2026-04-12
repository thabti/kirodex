import { useEffect, useCallback, useState, useRef, lazy, Suspense } from "react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import { useTaskStore, initTaskListeners } from "@/stores/taskStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useDebugStore } from "@/stores/debugStore";
import { useDiffStore } from "@/stores/diffStore";
import { useKiroStore, initKiroListeners } from "@/stores/kiroStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUpdateChecker } from "@/hooks/useUpdateChecker";
import { useShallow } from "zustand/react/shallow";
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
        <p className="text-[13px] font-medium text-amber-200/90">Sign in to Kiro to start using AI agents</p>
        <p className="text-[11px] text-amber-200/50">Authentication is required to create threads and interact with agents</p>
      </div>
      <button
        type="button"
        onClick={openLogin}
        className="shrink-0 rounded-lg bg-amber-500/20 px-3 py-1.5 text-[12px] font-medium text-amber-200 transition-colors hover:bg-amber-500/30"
      >
        Sign in
      </button>
    </div>
  );
}

function EmptyState() {
  const projects = useTaskStore((s) => s.projects);
  const handleNew = useCallback(() => {
    if (projects.length > 0) {
      useTaskStore.getState().setPendingWorkspace(projects[0]);
    } else {
      useTaskStore.getState().setNewProjectOpen(true);
    }
  }, [projects]);

  return (
    <div data-testid="empty-state" className="flex min-h-0 flex-1 flex-col">
      {/* Skeleton messages at low opacity */}
      <div
        className="flex flex-1 flex-col gap-4 px-6 pt-8 opacity-[0.07] select-none"
        aria-hidden
      >
        <div className="ml-auto flex max-w-[55%] flex-col gap-1.5 items-end">
          <div className="h-3 w-48 rounded-full bg-foreground" />
          <div className="h-3 w-32 rounded-full bg-foreground" />
        </div>
        <div className="flex max-w-[65%] flex-col gap-1.5">
          <div className="h-3 w-64 rounded-full bg-foreground" />
          <div className="h-3 w-80 rounded-full bg-foreground" />
          <div className="h-3 w-56 rounded-full bg-foreground" />
        </div>
        <div className="ml-auto flex max-w-[45%] flex-col gap-1.5 items-end">
          <div className="h-3 w-40 rounded-full bg-foreground" />
        </div>
        <div className="flex max-w-[60%] flex-col gap-1.5">
          <div className="h-3 w-72 rounded-full bg-foreground" />
          <div className="h-3 w-48 rounded-full bg-foreground" />
          <div className="h-3 w-64 rounded-full bg-foreground" />
          <div className="h-3 w-36 rounded-full bg-foreground" />
        </div>
      </div>

      {/* Ghost ChatInput */}
      <div
        className="px-4 pt-1.5 pb-3 mb-[20px] opacity-30 pointer-events-none select-none sm:px-6 sm:pt-2 sm:pb-4"
        aria-hidden
      >
        <div className="mx-auto w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl">
          <div className="rounded-[20px] border border-border bg-card">
            <div className="px-3 pb-2 pt-3.5 sm:px-4 sm:pt-4">
              <p className="min-h-[70px] text-[14px] leading-relaxed text-muted-foreground/35">
                Ask anything, or press / for commands
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 pb-3 sm:px-4">
              <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 px-1.5 py-1">
                <div className="h-4 w-14 rounded bg-muted-foreground/10" />
                <div className="mx-0.5 size-[3px] rounded-full bg-border" />
                <div className="h-4 w-20 rounded bg-muted-foreground/10" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-4 w-12 rounded bg-muted-foreground/10" />
                <div className="h-4 w-16 rounded bg-muted-foreground/10" />
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/90 opacity-30">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary-foreground"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Login banner */}
      <div className="absolute inset-x-0 top-6 flex justify-center px-6 pointer-events-auto z-10">
        <LoginBanner />
      </div>

      {/* New thread CTA over the skeleton */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
        <p className="text-sm text-muted-foreground/50 select-none">
          {projects.length > 0
            ? "Start a conversation with Kiro"
            : "Import a project folder to get started"}
        </p>
        <button
          type="button"
          onClick={handleNew}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            {projects.length > 0 ? (
              <>
                <line x1="7" y1="2" x2="7" y2="12" />
                <line x1="2" y1="7" x2="12" y2="7" />
              </>
            ) : (
              <>
                <path d="M12.5 10.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h3.5l1.5 2h4a1 1 0 0 1 1 1z" />
              </>
            )}
          </svg>
          {projects.length > 0 ? "New Thread" : "Import Project"}
        </button>
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
  const hasOnboarded = useSettingsStore((s) => s.settings.hasOnboarded);
  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  useKeyboardShortcuts();

  // Apply font size from settings to the document root
  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-size', `${fontSize ?? 13}px`);
  }, [fontSize]);

  // Sync active workspace → apply per-project model/autoApprove prefs
  useEffect(() => {
    const tasks = useTaskStore.getState().tasks;
    const workspace = selectedTaskId
      ? (tasks[selectedTaskId]?.workspace ?? null)
      : null;
    useSettingsStore.getState().setActiveWorkspace(workspace);
  }, [selectedTaskId]);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);

  // Sync diffStore.isOpen → sidePanelOpen (for openToFile)
  const diffIsOpen = useDiffStore((s) => s.isOpen);
  useEffect(() => {
    if (diffIsOpen && !sidePanelOpen) setSidePanelOpen(true);
  }, [diffIsOpen]);

  useEffect(() => {
    useTaskStore.getState().loadTasks();
    useSettingsStore.getState().loadSettings();
    useSettingsStore.getState().checkAuth();
    // Pre-warm ACP to get models/modes before user creates a thread
    ipc.probeCapabilities().catch(() => {});
    // Request notification permission so end_turn alerts work
    import("@tauri-apps/plugin-notification").then(({ isPermissionGranted, requestPermission }) => {
      isPermissionGranted().then((granted) => {
        if (!granted) requestPermission();
      });
    }).catch(() => {});
    const cleanupTask = initTaskListeners();
    const cleanupKiro = initKiroListeners();
    return () => {
      cleanupTask();
      cleanupKiro();
    };
  }, []);

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

  const toggleSidePanel = useCallback(() => setSidePanelOpen((o) => !o), []);
  const closeSidePanel = useCallback(() => setSidePanelOpen(false), []);
  const toggleSidebar = useCallback(() => setIsSidebarCollapsed((v) => !v), []);

  if (settingsLoaded && !hasOnboarded)
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
          />
        </ErrorBoundary>

        {/* Main area: sidebar + content + side panel */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary>
            {!isSidebarCollapsed && <TaskSidebar width={sidebarWidth} onResize={setSidebarWidth} />}
          </ErrorBoundary>
          <main data-testid="main-content" className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <ErrorBoundary>
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ fontSize: 'var(--app-font-size, 14px)' }}>
                <Suspense>
                  {selectedTaskId ? (
                    <ChatPanel />
                  ) : pendingWorkspace ? (
                    <PendingChat key={pendingWorkspace} workspace={pendingWorkspace} />
                  ) : (
                    <EmptyState />
                  )}
                </Suspense>
              </div>
            </ErrorBoundary>
            {sidePanelOpen && selectedTaskId && (
              <ErrorBoundary>
                <Suspense>
                  <CodePanel onClose={closeSidePanel} />
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
    </TooltipProvider>
  );
}

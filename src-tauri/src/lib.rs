#![allow(unexpected_cfgs, unused_imports)]

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

pub mod commands;
pub mod web;

use commands::{acp, analytics, branch_ai, checkpoint, diff_parse, fs_ops, fuzzy, git, git_ai, git_history, git_pr, git_stack, highlight, kiro_config, kiro_watcher, markdown, pattern_extract, pr_ai, process_diagnostics, project_watcher, pty, settings, streaming_diff, thread_db, thread_title, tracing as app_tracing, transport, vcs_status};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;
use tauri::Emitter;
use tauri::Listener;

/// Flag set by the frontend before calling `relaunch()` so the
/// `CloseRequested` handler skips the quit confirmation dialog.
struct RelaunchFlag(AtomicBool);

impl Default for RelaunchFlag {
    fn default() -> Self {
        Self(AtomicBool::new(false))
    }
}

#[tauri::command]
fn set_relaunch_flag(flag: tauri::State<'_, RelaunchFlag>) {
    flag.0.store(true, Ordering::Release);
}

#[tauri::command]
fn rebuild_recent_menu(app: tauri::AppHandle) {
    rebuild_menu(&app);
}

#[tauri::command]
fn reset_app_data(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if dir.exists() {
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    Ok(())
}

/// Install a global panic hook that logs the panic message and backtrace.
/// This catches panics on *any* thread (background ACP, probe, PTY reader)
/// that would otherwise vanish silently.
fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let name = thread.name().unwrap_or("<unnamed>");
        let location = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown>".to_string());
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "non-string panic payload".to_string()
        };
        // Log via the log crate (goes to tauri_plugin_log → file + console)
        log::error!(
            "PANIC on thread '{}' at {}: {}",
            name, location, payload
        );
        // Also write to stderr in case the log system is down
        eprintln!(
            "[Kirodex PANIC] thread '{}' at {}: {}",
            name, location, payload
        );
        // Call the default hook so the backtrace still prints in dev
        default_hook(info);
    }));
}

/// Gracefully shut down all ACP connections and PTY sessions.
fn shutdown_app(app: &tauri::AppHandle) {
    log::info!("Window close requested — shutting down");
    let start = std::time::Instant::now();

    // Kill all ACP connections
    if let Some(acp_state) = app.try_state::<acp::AcpState>() {
        {
            let mut conns = acp_state.connections.lock();
            let count = conns.len();
            for (task_id, handle) in conns.drain() {
                log::info!("Killing ACP connection: {}", task_id);
                let _ = handle.cmd_tx.send(acp::AcpCommand::Kill);
                // Drop the sender so the receiver side unblocks
                drop(handle);
            }
            log::info!("Sent kill to {} ACP connection(s)", count);
        }

        // Drop all pending permission resolvers so blocked ACP threads unblock
        {
            let mut resolvers = acp_state.permission_resolvers.lock();
            let count = resolvers.len();
            resolvers.clear(); // Dropping oneshot::Sender causes Err on the receiver
            if count > 0 {
                log::info!("Dropped {} pending permission resolver(s)", count);
            }
        }
    }

    // Kill all PTY sessions
    if let Some(pty_state) = app.try_state::<pty::PtyState>() {
        let mut ptys = pty_state.0.lock();
        let total: usize = ptys.values().map(|m| m.len()).sum();
        ptys.clear(); // Drop impl on each PtyInstance kills its child and waits
        if total > 0 {
            log::info!("Killed {} PTY session(s)", total);
        }
    }

    // Stop all file watchers
    kiro_watcher::stop_all(app);
    project_watcher::stop_all_project_watchers(app);

    log::info!("Shutdown completed in {:?}", start.elapsed());
}

/// Kill every PTY belonging to a single window. Called when a non-last
/// window closes so its terminals don't leak until app exit (and so that
/// closing one window doesn't bleed into another window's PTYs).
fn kill_window_ptys(app: &tauri::AppHandle, window_label: &str) {
    if let Some(pty_state) = app.try_state::<pty::PtyState>() {
        let killed = pty_state.kill_window(window_label);
        if killed > 0 {
            log::info!("Killed {} PTY session(s) for window '{}'", killed, window_label);
        }
    }
}

/// Re-position the macOS traffic light buttons (close, minimize, zoom) to match
/// the custom `trafficLightPosition` from tauri.conf.json. macOS resets their
/// position when the window gains or loses focus, so this must be called on
/// every focus change to prevent them from being clipped by the content view's
/// corner radius mask.
#[cfg(target_os = "macos")]
fn reposition_traffic_lights(ns_window: cocoa::base::id) {
    use cocoa::appkit::{NSView, NSWindow, NSWindowButton};
    use cocoa::foundation::NSRect;
    const TRAFFIC_LIGHT_X: f64 = 13.0;
    const TRAFFIC_LIGHT_Y: f64 = 13.0;
    unsafe {
        let close = ns_window.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
        let miniaturize = ns_window.standardWindowButton_(NSWindowButton::NSWindowMiniaturizeButton);
        let zoom = ns_window.standardWindowButton_(NSWindowButton::NSWindowZoomButton);
        if close.is_null() {
            return;
        }
        let title_bar_container = close.superview().superview();
        if title_bar_container.is_null() {
            return;
        }
        let title_bar_frame: NSRect = NSView::frame(title_bar_container);
        let close_rect: NSRect = NSView::frame(close);
        let button_height = close_rect.size.height;
        let vertical_offset = TRAFFIC_LIGHT_Y - (title_bar_frame.size.height - button_height) / 2.0;
        let space_between = 20.0_f64;
        for (i, button) in [close, miniaturize, zoom].iter().enumerate() {
            let mut rect: NSRect = NSView::frame(*button);
            rect.origin.x = TRAFFIC_LIGHT_X + (i as f64 * space_between);
            rect.origin.y = (title_bar_frame.size.height - button_height) / 2.0 - vertical_offset;
            button.setFrameOrigin(rect.origin);
        }
    }
}

/// Create a new Kirodex window with the same configuration as the main window.
fn create_new_window(app: &tauri::AppHandle) {
    let label = format!("window-{}", uuid::Uuid::new_v4().simple());
    let url = tauri::WebviewUrl::App("index.html".into());
    let builder = tauri::WebviewWindowBuilder::new(app, &label, url)
        .title("Kirodex")
        .inner_size(1400.0, 900.0)
        .min_inner_size(800.0, 600.0)
        .decorations(true)
        .zoom_hotkeys_enabled(true);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition::new(14.0, 22.0)));

    match builder.build() {
        Ok(_new_window) => {
            log::info!("Created new window: {}", label);
            #[cfg(target_os = "macos")]
            #[allow(deprecated)]
            {
                use cocoa::appkit::NSWindow;
                use cocoa::base::id;
                use objc::msg_send;
                use objc::sel;
                use objc::sel_impl;
                if let Ok(ns_win) = _new_window.ns_window() {
                    let ns_win = ns_win as id;
                    unsafe {
                        let content_view: id = ns_win.contentView();
                        let _: () = msg_send![content_view, setWantsLayer: true];
                        let layer: id = msg_send![content_view, layer];
                        let _: () = msg_send![layer, setCornerRadius: 12.0_f64];
                        let _: () = msg_send![layer, setMasksToBounds: true];
                    }
                    reposition_traffic_lights(ns_win);
                }
            }
        }
        Err(e) => log::error!("Failed to create new window: {e}"),
    }
}

/// Build the native application menu with custom File items.
fn build_app_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let new_window = MenuItemBuilder::new("New Window")
        .id("new_window")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let new_thread = MenuItemBuilder::new("New Thread")
        .id("new_thread")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let new_project = MenuItemBuilder::new("New Project…")
        .id("new_project")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let clone_from_github = MenuItemBuilder::new("Clone from GitHub…")
        .id("clone_from_github")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;

    // Build "Recent Projects" submenu from persisted data
    let recent_projects: Vec<String> = app
        .try_state::<settings::SettingsState>()
        .map(|s| s.0.lock().recent_projects.clone())
        .unwrap_or_default();

    let mut recent_submenu = SubmenuBuilder::new(app, "Recent Projects");
    if recent_projects.is_empty() {
        let no_recent = MenuItemBuilder::new("No Recent Projects")
            .id("recent_none")
            .enabled(false)
            .build(app)?;
        recent_submenu = recent_submenu.item(&no_recent);
    } else {
        // Detect ambiguous basenames so we can show parent/basename
        let basenames: Vec<&str> = recent_projects
            .iter()
            .map(|p| {
                std::path::Path::new(p)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(p)
            })
            .collect();
        for (i, path) in recent_projects.iter().enumerate() {
            let basename = basenames[i];
            let is_ambiguous = basenames.iter().filter(|&&b| b == basename).count() > 1;
            let label = if is_ambiguous {
                // Show parent/basename for disambiguation
                let p = std::path::Path::new(path);
                match p.parent().and_then(|par| par.file_name()).and_then(|n| n.to_str()) {
                    Some(parent) => format!("{}/{}", parent, basename),
                    None => path.to_string(),
                }
            } else {
                basename.to_string()
            };
            let item = MenuItemBuilder::new(&label)
                .id(format!("recent:{}", path))
                .build(app)?;
            recent_submenu = recent_submenu.item(&item);
        }
        let separator_item = tauri::menu::PredefinedMenuItem::separator(app)?;
        let clear_recent = MenuItemBuilder::new("Clear Recent Projects")
            .id("clear_recent")
            .build(app)?;
        recent_submenu = recent_submenu.item(&separator_item).item(&clear_recent);
    }
    let recent_submenu = recent_submenu.build()?;

    let app_submenu = SubmenuBuilder::new(app, "Kirodex")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file_submenu = SubmenuBuilder::new(app, "File")
        .item(&new_window)
        .item(&new_thread)
        .item(&new_project)
        .item(&clone_from_github)
        .separator()
        .item(&recent_submenu)
        .separator()
        .close_window()
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_submenu = SubmenuBuilder::new(app, "View")
        .fullscreen()
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let help_submenu = SubmenuBuilder::new(app, "Help")
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
            &help_submenu,
        ])
        .build()
}

/// Rebuild the native menu to reflect updated recent projects.
fn rebuild_menu(app: &tauri::AppHandle) {
    match build_app_menu(app) {
        Ok(menu) => {
            if let Err(e) = app.set_menu(menu) {
                log::error!("Failed to set menu: {e}");
            }
        }
        Err(e) => log::error!("Failed to build menu: {e}"),
    }
}

pub fn run() {
    install_panic_hook();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin({
            let mut log_builder = tauri_plugin_log::Builder::new()
                .targets({
                    let mut targets = vec![
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
                    ];
                    #[cfg(debug_assertions)]
                    targets.push(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview));
                    targets
                });
            #[cfg(debug_assertions)]
            { log_builder = log_builder.level(log::LevelFilter::Debug); }
            #[cfg(not(debug_assertions))]
            { log_builder = log_builder.level(log::LevelFilter::Info); }
            log_builder.build()
        })
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .manage(settings::SettingsState::default())
        .manage(analytics::AnalyticsState::default())
        .manage(acp::AcpState::default())
        .manage(pty::PtyState::default())
        .manage(RelaunchFlag::default())
        .manage(kiro_watcher::KiroWatcherState::default())
        .manage(project_watcher::ProjectWatcherState::default())
        .manage(thread_db::ThreadDbState {
            db: thread_db::ThreadDatabase::open(),
        })
        .manage(highlight::HighlightState::default())
        .manage(fuzzy::FuzzyState::default())
        .manage(app_tracing::TraceState::default())
        .setup(|app| {
            let _window = app.get_webview_window("main")
                .ok_or_else(|| "main window not found".to_string())?;

            // Build and set the custom native menu
            let menu = build_app_menu(app.handle())?;
            app.set_menu(menu)?;

            // Handle custom menu item clicks
            app.on_menu_event(|app_handle, event| {
                let id = event.id().0.as_str();
                match id {
                    "new_window" => create_new_window(app_handle),
                    "new_thread" => {
                        let _ = app_handle.emit("menu-new-thread", ());
                    }
                    "new_project" => {
                        let _ = app_handle.emit("menu-new-project", ());
                    }
                    "clone_from_github" => {
                        let _ = app_handle.emit("menu-clone-from-github", ());
                    }
                    "clear_recent" => {
                        if let Some(state) = app_handle.try_state::<settings::SettingsState>() {
                            let mut store = state.0.lock();
                            store.recent_projects.clear();
                            let _ = settings::persist_store(&store);
                        }
                        rebuild_menu(app_handle);
                    }
                    _ if id.starts_with("recent:") => {
                        let path = &id["recent:".len()..];
                        if !path.is_empty() {
                            let _ = app_handle.emit("menu-open-recent-project", path);
                        }
                    }
                    _ => {}
                }
            });

            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(target_os = "macos")]
            #[allow(deprecated)]
            {
                use cocoa::appkit::{NSApplication, NSApplicationActivationPolicy, NSWindow};
                use cocoa::base::id;
                use objc::msg_send;
                use objc::sel;
                use objc::sel_impl;

                // Ensure the app has Regular activation policy so NSOpenPanel works.
                // Without this, objc2-app-kit 0.3+ panics with NULL from +[NSOpenPanel openPanel].
                unsafe {
                    let ns_app = cocoa::appkit::NSApp();
                    ns_app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyRegular);
                }

                let ns_window = _window.ns_window().unwrap() as id;
                unsafe {
                    let content_view: id = ns_window.contentView();
                    let _: () = msg_send![content_view, setWantsLayer: true];
                    let layer: id = msg_send![content_view, layer];
                    let _: () = msg_send![layer, setCornerRadius: 12.0_f64];
                    let _: () = msg_send![layer, setMasksToBounds: true];
                }
                // Initial positioning of traffic lights
                reposition_traffic_lights(ns_window);
            }
            log::info!("Kirodex started (pid={})", std::process::id());
            // Start watching global ~/.kiro for config changes
            kiro_watcher::watch_global_kiro(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let app = window.app_handle();

                    // If a relaunch is in progress, skip the confirmation dialog
                    // and let the close proceed so `relaunch()` can restart the app.
                    if let Some(flag) = app.try_state::<RelaunchFlag>() {
                        if flag.0.load(Ordering::Acquire) {
                            // The frontend already flushed state in prepareForRelaunch()
                            // before calling relaunch(). Skip the flush-before-quit/ack
                            // cycle — the webview is being torn down and can't respond.
                            log::info!("Relaunch flag set — skipping flush, shutting down immediately");
                            shutdown_app(&app);
                            return;
                        }
                    }

                    let window_count = app.webview_windows().len();
                    // Secondary windows close without confirmation, but their
                    // PTYs must die with them — otherwise terminals from the
                    // closed window stay in our map and the reader threads
                    // keep emitting to a dead webview.
                    if window_count > 1 {
                        kill_window_ptys(&app, window.label());
                        return;
                    }
                    // Last window — show quit confirmation
                    api.prevent_close();
                    let app = app.clone();
                    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
                    app.dialog()
                        .message("Are you sure you want to quit Kirodex?")
                        .title("Quit Kirodex")
                        .buttons(MessageDialogButtons::OkCancelCustom("Quit".to_string(), "Cancel".to_string()))
                        .show(move |confirmed| {
                            if confirmed {
                                // Tell the frontend to flush persisted state to disk
                                let _ = app.emit("app://flush-before-quit", ());
                                // Wait for the frontend to ack the flush, with a 2s timeout
                                let (tx, rx) = std::sync::mpsc::channel::<()>();
                                let app_clone = app.clone();
                                let _listener_id = app_clone.listen("app://flush-ack", move |_| {
                                    let _ = tx.send(());
                                });
                                let _ = rx.recv_timeout(std::time::Duration::from_secs(2));
                                shutdown_app(&app);
                                app.exit(0);
                            }
                        });
                }
                #[cfg(target_os = "macos")]
                tauri::WindowEvent::Focused(_) => {
                    // Re-position traffic lights on every focus/blur event for all windows.
                    #[allow(deprecated)]
                    if let Ok(ns_window) = window.ns_window() {
                        reposition_traffic_lights(ns_window as cocoa::base::id);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Settings
            settings::get_settings,
            settings::save_settings,
            settings::set_dock_icon,
            settings::reset_dock_icon,
            // File ops
            fs_ops::detect_kiro_cli,
            fs_ops::read_text_file,
            fs_ops::read_file_base64,
            fs_ops::is_directory,
            fs_ops::pick_folder,
            fs_ops::pick_image,
            fs_ops::open_in_editor,
            fs_ops::open_url,
            fs_ops::detect_editors,
            fs_ops::detect_editors_background,
            fs_ops::list_project_files,
            fs_ops::kiro_whoami,
            fs_ops::kiro_logout,
            fs_ops::open_terminal_with_command,
            fs_ops::detect_project_icon,
            fs_ops::list_small_images,
            // Git
            git::git_detect,
            git::git_init,
            git::git_clone,
            git::git_list_branches,
            git::git_checkout,
            git::git_checkout_remote,
            git::git_create_branch,
            git::git_delete_branch,
            git::git_commit,
            git::git_push,
            git::git_pull,
            git::git_fetch,
            git::git_stage,
            git::git_revert,
            git::task_diff,
            git::task_diff_stats,
            git::git_diff,
            git::git_diff_file,
            git::git_diff_stats,
            git::git_staged_stats,
            git::git_remote_url,
            git_ai::git_generate_commit_message,
            git::git_changed_files,
            git::git_stage_files,
            git::git_commit_files,
            git::git_create_and_checkout_branch,
            git::git_add_remote,
            git::git_worktree_create,
            git::git_worktree_remove,
            git::git_worktree_has_changes,
            git::git_worktree_setup,
            // ACP
            acp::task_create,
            acp::task_list,
            acp::task_send_message,
            acp::task_pause,
            acp::task_resume,
            acp::task_cancel,
            acp::task_delete,
            acp::task_fork,
            acp::task_allow_permission,
            acp::task_deny_permission,
            acp::task_set_auto_approve,
            acp::set_mode,
            acp::set_model,
            acp::list_models,
            acp::probe_capabilities,
            // PTY
            pty::pty_create,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_count,
            // Kiro config
            kiro_config::get_kiro_config,
            kiro_config::save_mcp_server_config,
            kiro_config::mcp_add_server,
            kiro_config::mcp_remove_server,
            // Kiro watcher
            kiro_watcher::watch_kiro_path,
            kiro_watcher::unwatch_kiro_path,
            // Project watcher & file operations
            project_watcher::watch_project_tree,
            project_watcher::unwatch_project_tree,
            project_watcher::scan_directory,
            project_watcher::scan_root,
            project_watcher::create_file,
            project_watcher::create_directory,
            project_watcher::delete_entry,
            project_watcher::rename_entry,
            project_watcher::copy_entry,
            project_watcher::duplicate_entry,
            project_watcher::copy_entry_path,
            project_watcher::reveal_in_finder,
            project_watcher::open_in_default_app,
            project_watcher::open_terminal_at,
            project_watcher::add_to_gitignore,
            project_watcher::open_finder_search,
            // Analytics
            analytics::analytics_save,
            analytics::analytics_load,
            analytics::analytics_clear,
            analytics::analytics_db_size,
            analytics::analytics_coding_hours_by_day,
            analytics::analytics_messages_by_day,
            analytics::analytics_tokens_by_day,
            analytics::analytics_diff_stats_by_day,
            analytics::analytics_model_popularity,
            analytics::analytics_tool_call_breakdown,
            analytics::analytics_mode_usage,
            analytics::analytics_project_stats,
            analytics::analytics_totals,
            // Streaming Diff
            streaming_diff::compute_diff,
            streaming_diff::compute_line_diff,
            // Structured diff parsing
            diff_parse::task_diff_structured,
            diff_parse::git_diff_structured,
            // Markdown parsing
            markdown::parse_markdown,
            // Syntax highlighting
            highlight::highlight_code,
            highlight::highlight_supported_languages,
            // Fuzzy match
            fuzzy::fuzzy_match,
            // MCP Transport
            transport::mcp_transport_test,
            // Thread title generation
            thread_title::generate_thread_title,
            branch_ai::generate_branch_name,
            branch_ai::rename_worktree_branch,
            pr_ai::generate_pr_content,
            vcs_status::git_vcs_status,
            git_stack::git_list_stack,
            git_stack::git_stacked_push,
            process_diagnostics::list_child_processes,
            process_diagnostics::signal_process,
            // Checkpoint
            checkpoint::checkpoint_create,
            checkpoint::checkpoint_list,
            checkpoint::checkpoint_diff,
            checkpoint::checkpoint_revert,
            checkpoint::checkpoint_cleanup,
            // Git History
            git_history::git_commit_history,
            git_history::git_commit_diff,
            git_history::git_commit_stats,
            git_history::git_stash_list,
            git_history::git_stash_pop,
            git_history::git_stash_drop,
            git_history::git_stash_save,
            // Thread Database
            thread_db::thread_db_list,
            thread_db::thread_db_load,
            thread_db::thread_db_save,
            thread_db::thread_db_delete,
            thread_db::thread_db_messages,
            thread_db::thread_db_save_message,
            thread_db::thread_db_search,
            thread_db::thread_db_stats,
            thread_db::thread_db_clear_all,
            thread_db::thread_db_auto_archive,
            // Relaunch
            set_relaunch_flag,
            // Reset
            reset_app_data,
            // Recent projects
            settings::get_recent_projects,
            settings::add_recent_project,
            settings::clear_recent_projects,
            rebuild_recent_menu,
            // PR / MR creation (GitHub + GitLab)
            git_pr::git_detect_provider,
            git_pr::git_create_pr,
            git_pr::git_pr_status,
            git_pr::git_pr_open_in_browser,
            // Pattern extraction (code signatures for agent context)
            pattern_extract::extract_patterns,
            pattern_extract::extract_patterns_batch,
            // Structured tracing (NDJSON debug traces)
            app_tracing::trace_read_recent,
            app_tracing::trace_file_location,
            app_tracing::trace_clear,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Failed to start Kirodex: {e}");
            std::process::exit(1);
        });
}

pub fn run_serve(options: web::ServeOptions) -> Result<(), String> {
    install_panic_hook();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_name("kirodex-web")
        .build()
        .map_err(|e| format!("Failed to start async runtime: {e}"))?;
    runtime.block_on(web::serve(options))
}

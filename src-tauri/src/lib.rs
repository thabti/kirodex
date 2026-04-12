#![allow(unexpected_cfgs, unused_imports)]

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod commands;

use commands::{acp, fs_ops, git, kiro_config, pty, settings};
use tauri::Manager;

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
/// Uses lock timeouts (via try_lock) to avoid blocking the close handler
/// if a mutex is poisoned or contested.
fn shutdown_app(app: &tauri::AppHandle) {
    log::info!("Window close requested — shutting down");
    let start = std::time::Instant::now();

    // Kill all ACP connections
    if let Some(acp_state) = app.try_state::<acp::AcpState>() {
        match acp_state.connections.lock() {
            Ok(mut conns) => {
                let count = conns.len();
                for (task_id, handle) in conns.drain() {
                    log::info!("Killing ACP connection: {}", task_id);
                    let _ = handle.cmd_tx.send(acp::AcpCommand::Kill);
                    // Drop the sender so the receiver side unblocks
                    drop(handle);
                }
                log::info!("Sent kill to {} ACP connection(s)", count);
            }
            Err(e) => log::error!("Cannot lock ACP connections on close: {}", e),
        }

        // Drop all pending permission resolvers so blocked ACP threads unblock
        match acp_state.permission_resolvers.lock() {
            Ok(mut resolvers) => {
                let count = resolvers.len();
                resolvers.clear(); // Dropping oneshot::Sender causes Err on the receiver
                if count > 0 {
                    log::info!("Dropped {} pending permission resolver(s)", count);
                }
            }
            Err(e) => log::error!("Cannot lock permission resolvers on close: {}", e),
        }
    }

    // Kill all PTY sessions
    if let Some(pty_state) = app.try_state::<pty::PtyState>() {
        match pty_state.0.lock() {
            Ok(mut ptys) => {
                let count = ptys.len();
                ptys.clear(); // Drop impl kills child processes and waits
                if count > 0 {
                    log::info!("Killed {} PTY session(s)", count);
                }
            }
            Err(e) => log::error!("Cannot lock PTY state on close: {}", e),
        }
    }

    log::info!("Shutdown completed in {:?}", start.elapsed());
}

pub fn run() {
    install_panic_hook();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .manage(settings::SettingsState::default())
        .manage(acp::AcpState::default())
        .manage(pty::PtyState::default())
        .setup(|app| {
            let _window = app.get_webview_window("main")
                .ok_or_else(|| "main window not found".to_string())?;

            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(target_os = "macos")]
            #[allow(deprecated)]
            {
                use cocoa::appkit::NSWindow;
                use cocoa::base::id;
                use objc::msg_send;
                use objc::sel;
                use objc::sel_impl;
                let ns_window = _window.ns_window().unwrap() as id;
                unsafe {
                    let content_view: id = ns_window.contentView();
                    let _: () = msg_send![content_view, setWantsLayer: true];
                    let layer: id = msg_send![content_view, layer];
                    let _: () = msg_send![layer, setCornerRadius: 12.0_f64];
                    let _: () = msg_send![layer, setMasksToBounds: true];
                }
            }
            log::info!("Kirodex started (pid={})", std::process::id());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                shutdown_app(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Settings
            settings::get_settings,
            settings::save_settings,
            // File ops
            fs_ops::detect_kiro_cli,
            fs_ops::read_text_file,
            fs_ops::read_file_base64,
            fs_ops::pick_folder,
            fs_ops::open_in_editor,
            fs_ops::open_url,
            fs_ops::detect_editors,
            fs_ops::list_project_files,
            fs_ops::kiro_whoami,
            fs_ops::kiro_logout,
            fs_ops::open_terminal_with_command,
            // Git
            git::git_detect,
            git::git_list_branches,
            git::git_checkout,
            git::git_create_branch,
            git::git_commit,
            git::git_push,
            git::git_pull,
            git::git_fetch,
            git::git_stage,
            git::git_revert,
            git::task_diff,
            git::git_diff_file,
            git::git_diff_stats,
            git::git_staged_stats,
            git::git_remote_url,
            // ACP
            acp::task_create,
            acp::task_list,
            acp::task_send_message,
            acp::task_pause,
            acp::task_resume,
            acp::task_cancel,
            acp::task_delete,
            acp::task_allow_permission,
            acp::task_deny_permission,
            acp::set_mode,
            acp::list_models,
            acp::probe_capabilities,
            // PTY
            pty::pty_create,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            // Kiro config
            kiro_config::get_kiro_config,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Failed to start Kirodex: {e}");
            std::process::exit(1);
        });
}

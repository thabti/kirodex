use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::Emitter;

use super::error::AppError;

#[derive(Serialize, Clone)]
struct PtyDataPayload {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct PtyExitPayload {
    id: String,
}

pub struct PtyInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

pub struct PtyState(pub Mutex<HashMap<String, PtyInstance>>);

impl Default for PtyState {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

#[tauri::command]
pub fn pty_create(
    state: tauri::State<'_, PtyState>,
    window: tauri::Window,
    id: String,
    cwd: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), AppError> {
    let cols = cols.unwrap_or(80);
    let rows = rows.unwrap_or(24);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Other(e.to_string()))?;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&cwd);
    let _child = pair.slave.spawn_command(cmd).map_err(|e| AppError::Other(e.to_string()))?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| AppError::Other(e.to_string()))?;
    let writer = pair.master.take_writer().map_err(|e| AppError::Other(e.to_string()))?;
    let event_id = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = window.emit("pty_exit", PtyExitPayload { id: event_id.clone() });
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = window.emit(
                        "pty_data",
                        PtyDataPayload { id: event_id.clone(), data },
                    );
                }
                Err(_) => {
                    let _ = window.emit("pty_exit", PtyExitPayload { id: event_id.clone() });
                    break;
                }
            }
        }
    });
    let instance = PtyInstance {
        master: pair.master,
        writer,
    };
    let mut ptys = state.0.lock().map_err(|_| AppError::LockPoisoned)?;
    ptys.insert(id, instance);
    Ok(())
}

#[tauri::command]
pub fn pty_write(state: tauri::State<'_, PtyState>, id: String, data: String) -> Result<(), AppError> {
    let mut ptys = state.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let instance = ptys.get_mut(&id).ok_or_else(|| AppError::Other("PTY not found".to_string()))?;
    let _ = instance.writer.write_all(data.as_bytes());
    let _ = instance.writer.flush();
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    let ptys = state.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let instance = ptys.get(&id).ok_or_else(|| AppError::Other("PTY not found".to_string()))?;
    let _ = instance.master.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    });
    Ok(())
}

#[tauri::command]
pub fn pty_kill(state: tauri::State<'_, PtyState>, id: String) -> Result<(), AppError> {
    let mut ptys = state.0.lock().map_err(|_| AppError::LockPoisoned)?;
    ptys.remove(&id).ok_or_else(|| AppError::Other("PTY not found".to_string()))?;
    Ok(())
}

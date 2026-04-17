mod client;
mod commands;
mod connection;
mod sandbox;
pub mod types;

#[cfg(test)]
mod tests;

// Re-export public API so `crate::commands::acp::*` still resolves
pub use commands::*;
pub use types::*;

// Re-export connection helpers for testing
pub(crate) use connection::{strip_image_tags, build_content_blocks};

// Re-export sandbox functions for crate-internal use
pub(crate) use sandbox::{
    extract_paths_from_json, extract_paths_from_json_inner, extract_paths_from_message,
    friendly_prompt_error, is_path_allowed, is_path_strictly_allowed, is_within_workspace,
};

use std::time::{SystemTime, UNIX_EPOCH};

fn now_millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

fn now_rfc3339() -> String {
    // Produce a UTC timestamp like 2024-01-15T12:30:45Z
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = d.as_secs();
    // Days/hours/minutes/seconds from epoch
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;
    // Date from days since epoch (simplified Gregorian)
    let (y, mo, day) = days_to_ymd(days);
    format!("{y:04}-{mo:02}-{day:02}T{h:02}:{m:02}:{s:02}Z")
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    // Algorithm from Howard Hinnant's chrono-compatible date library
    days += 719468;
    let era = days / 146097;
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

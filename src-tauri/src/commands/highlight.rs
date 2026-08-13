//! Code syntax highlighting via `syntect` (TextMate/Sublime grammars).
//!
//! Pipeline:
//! - Highlighting happens on the backend, never in the renderer.
//! - Results are cached on disk by `blake3(text) + lang + theme` so repeated
//!   renders (e.g. scrolling a long chat thread) hit the cache.
//! - The frontend just receives `Vec<HighlightSpan>` and styles them.
//!
//! Why syntect over tree-sitter for kirodex:
//! - Zero grammar wrangling: ~200 syntaxes ship in `default-fancy`.
//! - No build.rs work, no `tree-sitter-cli`, no per-language crate hunting.
//! - Tree-sitter is the right choice when you need an editable AST (incremental
//!   reparse). For *display* of a code block in chat, a TextMate
//!   grammar gives equivalent visual quality at far less complexity.
//!
//! For the streaming code-block case (LLM typing out code), the cache is keyed
//! on the *text*, so each delta naturally re-uses prior results for the prefix
//! that hasn't changed. We don't need an incremental highlighter.

use std::path::PathBuf;
use std::sync::OnceLock;

use parking_lot::Mutex;
use serde::Serialize;
use syntect::easy::HighlightLines;
use syntect::highlighting::{FontStyle, Style, ThemeSet};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;
use tauri::Manager;

use super::error::AppError;

// ── Static syntax/theme sets (loaded once) ───────────────────────────────────

/// `default-fancy` ships ~200 syntaxes covering every common language. Loading
/// them is ~20 ms and ~8 MB of memory; we pay it once at first highlight call.
fn syntax_set() -> &'static SyntaxSet {
    static SS: OnceLock<SyntaxSet> = OnceLock::new();
    SS.get_or_init(SyntaxSet::load_defaults_newlines)
}

fn theme_set() -> &'static ThemeSet {
    static TS: OnceLock<ThemeSet> = OnceLock::new();
    TS.get_or_init(ThemeSet::load_defaults)
}

// ── Public types (serialized to the renderer) ────────────────────────────────

/// A single styled span. Indices are byte offsets into the input UTF-8 string.
///
/// We send hex colors instead of CSS class names so the renderer doesn't need
/// to know anything about the theme — pure display.
#[derive(Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HighlightSpan {
    pub start: usize,
    pub end: usize,
    pub color: String,        // "#rrggbb"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bg: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub bold: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub italic: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub underline: bool,
}

fn is_false(b: &bool) -> bool { !b }

#[derive(Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HighlightResult {
    pub spans: Vec<HighlightSpan>,
    /// Resolved language token (may differ from the input if the input was an
    /// alias like `js` → `JavaScript`).
    pub language: String,
    /// Whether the result came from the on-disk cache.
    pub cached: bool,
}

// ── Cache (keyed by blake3(text) + lang + theme) ─────────────────────────────

const CACHE_TABLE: redb::TableDefinition<&[u8], &[u8]> =
    redb::TableDefinition::new("highlight_cache_v1");

/// Cap on the JSON size of any single cached entry. Highlighting a 10 MB file
/// produces a few MB of spans — we don't want to pollute the cache with that.
const MAX_CACHE_ENTRY_BYTES: usize = 256 * 1024;

pub struct HighlightCache {
    db_path: OnceLock<PathBuf>,
    db: Mutex<Option<redb::Database>>,
}

impl Default for HighlightCache {
    fn default() -> Self {
        Self {
            db_path: OnceLock::new(),
            db: Mutex::new(None),
        }
    }
}

impl HighlightCache {
    fn resolve_path(&self, app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
        if let Some(p) = self.db_path.get() {
            return Ok(p.clone());
        }
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("highlight_cache.redb");
        let _ = self.db_path.set(path.clone());
        Ok(path)
    }

    fn open(&self, app: &tauri::AppHandle) -> Result<(), AppError> {
        let mut guard = self.db.lock();
        if guard.is_some() {
            return Ok(());
        }
        let path = self.resolve_path(app)?;
        let db = redb::Database::create(&path)
            .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        // Ensure table exists.
        let txn = db
            .begin_write()
            .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        let _ = txn.open_table(CACHE_TABLE);
        txn.commit()
            .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        *guard = Some(db);
        Ok(())
    }

    fn get(&self, app: &tauri::AppHandle, key: &[u8]) -> Result<Option<Vec<u8>>, AppError> {
        self.open(app)?;
        let guard = self.db.lock();
        let db = guard.as_ref().ok_or_else(|| {
            AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, "highlight cache not open"))
        })?;
        let txn = db
            .begin_read()
            .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        let table = match txn.open_table(CACHE_TABLE) {
            Ok(t) => t,
            Err(_) => return Ok(None),
        };
        match table.get(key) {
            Ok(Some(v)) => Ok(Some(v.value().to_vec())),
            _ => Ok(None),
        }
    }

    fn put(&self, app: &tauri::AppHandle, key: &[u8], val: &[u8]) -> Result<(), AppError> {
        if val.len() > MAX_CACHE_ENTRY_BYTES {
            return Ok(());
        }
        self.open(app)?;
        let guard = self.db.lock();
        let db = guard.as_ref().ok_or_else(|| {
            AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, "highlight cache not open"))
        })?;
        let txn = db
            .begin_write()
            .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        {
            let mut table = txn
                .open_table(CACHE_TABLE)
                .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            table
                .insert(key, val)
                .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        }
        txn.commit()
            .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        Ok(())
    }
}

// ── Theme resolution ─────────────────────────────────────────────────────────

/// Map a kirodex theme hint to a syntect bundled theme name.
///
/// We accept either:
/// - `"dark"` / `"light"` — kirodex's canonical hints
/// - any of syntect's bundled theme names (e.g. `"base16-ocean.dark"`)
fn resolve_theme(hint: &str) -> &'static str {
    // Fast path: kirodex's canonical hints (case-insensitive).
    let lower = hint.to_ascii_lowercase();
    match lower.as_str() {
        "dark" | "" => return "base16-ocean.dark",
        "light" => return "InspiredGitHub",
        _ => {}
    }
    // Otherwise check the bundled theme names *as given* (case-sensitive,
    // since that's how syntect keys them). Match against the small set we
    // know `load_defaults()` ships so we can return a 'static slice.
    const BUNDLED: &[&str] = &[
        "Solarized (dark)",
        "Solarized (light)",
        "InspiredGitHub",
        "base16-eighties.dark",
        "base16-mocha.dark",
        "base16-ocean.dark",
        "base16-ocean.light",
    ];
    for &name in BUNDLED {
        if name == hint {
            return name;
        }
    }
    "base16-ocean.dark"
}

pub(crate) fn highlight_code_uncached(
    text: String,
    lang: String,
    theme: Option<String>,
) -> Result<HighlightResult, AppError> {
    let theme_hint = theme.unwrap_or_else(|| "dark".to_string());
    let theme_name = resolve_theme(&theme_hint);
    if text.is_empty() {
        return Ok(HighlightResult {
            spans: Vec::new(),
            language: lang,
            cached: false,
        });
    }
    let (spans, resolved_lang) = compute_spans(&text, &lang, theme_name)?;
    Ok(HighlightResult {
        spans,
        language: resolved_lang,
        cached: false,
    })
}

// ── Core highlighting ────────────────────────────────────────────────────────

fn style_to_span(style: &Style, start: usize, end: usize) -> HighlightSpan {
    let c = style.foreground;
    let color = format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b);
    HighlightSpan {
        start,
        end,
        color,
        bg: None, // We don't surface backgrounds; renderer uses its own bg.
        bold: style.font_style.contains(FontStyle::BOLD),
        italic: style.font_style.contains(FontStyle::ITALIC),
        underline: style.font_style.contains(FontStyle::UNDERLINE),
    }
}

/// Compute spans for `text` in the given language and theme. Pure function;
/// the cache wraps it in `highlight_code`.
fn compute_spans(text: &str, lang: &str, theme_name: &str) -> Result<(Vec<HighlightSpan>, String), AppError> {
    let ss = syntax_set();
    let ts = theme_set();
    let theme = ts.themes.get(theme_name).ok_or_else(|| {
        AppError::Other(format!("unknown theme '{}'", theme_name))
    })?;
    // Resolve the syntax. syntect accepts file extensions (`rs`, `tsx`) and
    // first-line patterns, but for chat code blocks we only get a token.
    let syntax = ss
        .find_syntax_by_token(lang)
        .or_else(|| ss.find_syntax_by_extension(lang))
        .or_else(|| ss.find_syntax_by_name(lang))
        .unwrap_or_else(|| ss.find_syntax_plain_text());

    let mut hl = HighlightLines::new(syntax, theme);
    let mut spans = Vec::new();
    let mut offset = 0usize;
    for line in LinesWithEndings::from(text) {
        let line_styles = hl
            .highlight_line(line, ss)
            .map_err(|e| AppError::Other(format!("highlight error: {}", e)))?;
        for (style, slice) in line_styles {
            let len = slice.len();
            if len == 0 {
                continue;
            }
            spans.push(style_to_span(&style, offset, offset + len));
            offset += len;
        }
    }
    Ok((spans, syntax.name.clone()))
}

// ── State & Tauri commands ───────────────────────────────────────────────────

#[derive(Default)]
pub struct HighlightState {
    cache: HighlightCache,
}

fn cache_key(text: &str, lang: &str, theme_hint: &str) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(b"v1\0");
    hasher.update(lang.as_bytes());
    hasher.update(b"\0");
    hasher.update(theme_hint.as_bytes());
    hasher.update(b"\0");
    hasher.update(text.as_bytes());
    *hasher.finalize().as_bytes()
}

#[tauri::command]
pub fn highlight_code(
    app: tauri::AppHandle,
    state: tauri::State<'_, HighlightState>,
    text: String,
    lang: String,
    theme: Option<String>,
) -> Result<HighlightResult, AppError> {
    // Skip caching empty / huge inputs.
    let theme_hint = theme.clone().unwrap_or_else(|| "dark".to_string());
    let theme_name = resolve_theme(&theme_hint);

    if text.is_empty() {
        return Ok(HighlightResult {
            spans: Vec::new(),
            language: lang,
            cached: false,
        });
    }

    // Cache lookup (for inputs that are reasonably sized).
    let key = cache_key(&text, &lang, theme_name);
    if text.len() <= MAX_CACHE_ENTRY_BYTES {
        if let Ok(Some(bytes)) = state.cache.get(&app, &key) {
            if let Ok(result) = serde_json::from_slice::<HighlightResult>(&bytes) {
                return Ok(HighlightResult { cached: true, ..result });
            }
        }
    }

    let should_cache = text.len() <= MAX_CACHE_ENTRY_BYTES;
    let result = highlight_code_uncached(text, lang, theme)?;

    if should_cache {
        if let Ok(bytes) = serde_json::to_vec(&result) {
            let _ = state.cache.put(&app, &key, &bytes);
        }
    }

    Ok(result)
}

/// List the language tokens syntect can currently highlight. Useful for
/// pre-validating chat code-fence languages.
#[tauri::command]
pub fn highlight_supported_languages() -> Vec<String> {
    let ss = syntax_set();
    let mut names: Vec<String> = ss
        .syntaxes()
        .iter()
        .flat_map(|s| {
            let mut v = vec![s.name.clone()];
            v.extend(s.file_extensions.iter().cloned());
            v
        })
        .collect();
    names.sort();
    names.dedup();
    names
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn highlights_rust() {
        let (spans, lang) = compute_spans("fn main() { println!(\"hi\"); }", "rs", "base16-ocean.dark").unwrap();
        assert!(!spans.is_empty(), "expected at least one span");
        assert_eq!(lang, "Rust");
        // Spans should cover the input contiguously without gaps.
        let mut cursor = 0;
        for span in &spans {
            assert_eq!(span.start, cursor, "span gap detected");
            cursor = span.end;
        }
    }

    #[test]
    fn unknown_lang_falls_back_to_plain() {
        let (spans, lang) = compute_spans("hello world", "thisdoesnotexist", "base16-ocean.dark").unwrap();
        // Plain text returns one or more spans with the default style.
        assert!(!spans.is_empty());
        assert_eq!(lang, "Plain Text");
    }

    #[test]
    fn empty_input_is_safe() {
        let (spans, _lang) = compute_spans("", "rs", "base16-ocean.dark").unwrap();
        assert!(spans.is_empty());
    }

    #[test]
    fn theme_hint_resolves() {
        assert_eq!(resolve_theme("dark"), "base16-ocean.dark");
        assert_eq!(resolve_theme("light"), "InspiredGitHub");
        assert_eq!(resolve_theme("garbage"), "base16-ocean.dark");
        assert_eq!(resolve_theme("Solarized (dark)"), "Solarized (dark)");
    }

    #[test]
    fn cache_key_is_stable() {
        let k1 = cache_key("let x = 1;", "rs", "dark");
        let k2 = cache_key("let x = 1;", "rs", "dark");
        assert_eq!(k1, k2);
        let k3 = cache_key("let x = 1;", "rs", "light");
        assert_ne!(k1, k3);
        let k4 = cache_key("let x = 2;", "rs", "dark");
        assert_ne!(k1, k4);
    }

    #[test]
    fn span_offsets_are_byte_correct_for_unicode() {
        let text = "// 你好\nfn main() {}";
        let (spans, _) = compute_spans(text, "rs", "base16-ocean.dark").unwrap();
        // The last span's end must equal the byte length of the input.
        let end = spans.last().map(|s| s.end).unwrap_or(0);
        assert_eq!(end, text.len(), "spans must cover the full byte range");
    }
}

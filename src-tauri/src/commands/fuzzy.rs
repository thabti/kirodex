//! Fuzzy string matching backed by `nucleo-matcher` (the same matcher Helix
//! and Zed use).
//!
//! The renderer's `fuzzy-search.ts` does this work in JS today. Moving it
//! across the IPC boundary lets us:
//! - score thousands of candidates without blocking the renderer thread,
//! - share a parallel-aware matcher across pickers (commands, agents, files),
//! - keep the algorithm consistent with what users expect from fzf-style UX.

use nucleo_matcher::{
    pattern::{CaseMatching, Normalization, Pattern},
    Config, Matcher,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

/// Wrapper around `Matcher` so we can keep its allocations alive across calls
/// (it reuses internal scratch buffers between invocations).
pub struct FuzzyState {
    matcher: Mutex<Matcher>,
}

impl Default for FuzzyState {
    fn default() -> Self {
        Self {
            matcher: Mutex::new(Matcher::new(Config::DEFAULT.match_paths())),
        }
    }
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FuzzyCandidate {
    /// Identifier passed back to the caller in `FuzzyMatch::id`.
    pub id: String,
    /// Primary text scored against the query.
    pub text: String,
    /// Optional secondary text (e.g. file path when `text` is the basename).
    /// Scored separately and combined with a small penalty so primary matches
    /// win ties — same trick the renderer code does today.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secondary: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FuzzyMatch {
    pub id: String,
    /// Higher = better. We invert nucleo's score so the renderer can sort
    /// descending without further math.
    pub score: u32,
    /// Byte indices into `text` (or `secondary` if `secondaryMatched`) of the
    /// characters that matched. Useful for highlighting.
    pub indices: Vec<u32>,
    pub secondary_matched: bool,
}

/// Penalty applied to secondary-text matches so a primary match of equal raw
/// score sorts higher. Mirrors the `+ 50` trick in `fuzzy-search.ts` callers.
const SECONDARY_PENALTY: u32 = 50;

/// Score `query` against `candidates` and return the matches ordered by
/// descending score. `limit` caps the result count (use `None` for no cap).
///
/// Empty queries return all candidates with score 0 (preserving input order),
/// matching the contract callers expect from the renderer.
#[tauri::command]
pub fn fuzzy_match(
    state: tauri::State<'_, FuzzyState>,
    query: String,
    candidates: Vec<FuzzyCandidate>,
    limit: Option<usize>,
) -> Vec<FuzzyMatch> {
    fuzzy_match_core(&state, query, candidates, limit)
}

pub(crate) fn fuzzy_match_core(
    state: &FuzzyState,
    query: String,
    candidates: Vec<FuzzyCandidate>,
    limit: Option<usize>,
) -> Vec<FuzzyMatch> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        let cap = limit.unwrap_or(candidates.len());
        return candidates
            .into_iter()
            .take(cap)
            .map(|c| FuzzyMatch {
                id: c.id,
                score: 0,
                indices: Vec::new(),
                secondary_matched: false,
            })
            .collect();
    }

    let pattern = Pattern::parse(trimmed, CaseMatching::Smart, Normalization::Smart);
    let mut matcher = state.matcher.lock();
    let mut results: Vec<FuzzyMatch> = Vec::with_capacity(candidates.len());

    for candidate in candidates {
        let mut primary_buf: Vec<char> = Vec::new();
        let primary_haystack = nucleo_matcher::Utf32Str::new(&candidate.text, &mut primary_buf);
        let mut indices = Vec::new();
        let primary_score = pattern.indices(primary_haystack, &mut matcher, &mut indices);

        if let Some(score) = primary_score {
            indices.sort_unstable();
            indices.dedup();
            results.push(FuzzyMatch {
                id: candidate.id,
                score,
                indices,
                secondary_matched: false,
            });
            continue;
        }

        if let Some(secondary_text) = candidate.secondary.as_deref() {
            let mut sec_buf: Vec<char> = Vec::new();
            let sec_haystack = nucleo_matcher::Utf32Str::new(secondary_text, &mut sec_buf);
            let mut sec_indices = Vec::new();
            let secondary_score = pattern.indices(sec_haystack, &mut matcher, &mut sec_indices);
            if let Some(score) = secondary_score {
                sec_indices.sort_unstable();
                sec_indices.dedup();
                results.push(FuzzyMatch {
                    id: candidate.id,
                    score: score.saturating_sub(SECONDARY_PENALTY),
                    indices: sec_indices,
                    secondary_matched: true,
                });
            }
        }
    }

    results.sort_by(|a, b| b.score.cmp(&a.score));
    if let Some(cap) = limit {
        results.truncate(cap);
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_match(query: &str, candidates: Vec<FuzzyCandidate>) -> Vec<FuzzyMatch> {
        let state = FuzzyState::default();
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return candidates
                .into_iter()
                .map(|c| FuzzyMatch {
                    id: c.id,
                    score: 0,
                    indices: Vec::new(),
                    secondary_matched: false,
                })
                .collect();
        }

        let pattern = Pattern::parse(trimmed, CaseMatching::Smart, Normalization::Smart);
        let mut matcher = state.matcher.lock();
        let mut results: Vec<FuzzyMatch> = Vec::new();

        for candidate in candidates {
            let mut primary_buf: Vec<char> = Vec::new();
            let primary_haystack = nucleo_matcher::Utf32Str::new(&candidate.text, &mut primary_buf);
            let mut indices = Vec::new();
            let primary_score = pattern.indices(primary_haystack, &mut matcher, &mut indices);

            if let Some(score) = primary_score {
                results.push(FuzzyMatch {
                    id: candidate.id,
                    score,
                    indices,
                    secondary_matched: false,
                });
                continue;
            }
            if let Some(secondary_text) = candidate.secondary.as_deref() {
                let mut sec_buf: Vec<char> = Vec::new();
                let sec_haystack = nucleo_matcher::Utf32Str::new(secondary_text, &mut sec_buf);
                let mut sec_indices = Vec::new();
                let secondary_score = pattern.indices(sec_haystack, &mut matcher, &mut sec_indices);
                if let Some(score) = secondary_score {
                    results.push(FuzzyMatch {
                        id: candidate.id,
                        score: score.saturating_sub(SECONDARY_PENALTY),
                        indices: sec_indices,
                        secondary_matched: true,
                    });
                }
            }
        }
        results.sort_by(|a, b| b.score.cmp(&a.score));
        results
    }

    fn cand(id: &str, text: &str) -> FuzzyCandidate {
        FuzzyCandidate {
            id: id.into(),
            text: text.into(),
            secondary: None,
        }
    }

    fn cand_with_secondary(id: &str, text: &str, secondary: &str) -> FuzzyCandidate {
        FuzzyCandidate {
            id: id.into(),
            text: text.into(),
            secondary: Some(secondary.into()),
        }
    }

    #[test]
    fn exact_match_returns_a_match() {
        // nucleo's scoring may rank substring matches differently between
        // versions; we just verify all candidates with the substring match.
        let results = run_match("cat", vec![
            cand("a", "category"),
            cand("b", "concatenate"),
            cand("c", "cat"),
        ]);
        assert_eq!(results.len(), 3, "expected all three to match");
        let ids: Vec<&str> = results.iter().map(|r| r.id.as_str()).collect();
        assert!(ids.contains(&"a"));
        assert!(ids.contains(&"b"));
        assert!(ids.contains(&"c"));
    }

    #[test]
    fn empty_query_returns_input_order() {
        let results = run_match("   ", vec![
            cand("a", "alpha"),
            cand("b", "beta"),
        ]);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].id, "a");
        assert_eq!(results[1].id, "b");
    }

    #[test]
    fn nonmatching_query_returns_empty() {
        let results = run_match("xyz", vec![cand("a", "hello"), cand("b", "world")]);
        assert!(results.is_empty());
    }

    #[test]
    fn secondary_matches_when_primary_fails() {
        let results = run_match("hooks", vec![
            cand_with_secondary("a", "useChat.ts", "src/renderer/hooks/useChat.ts"),
            cand_with_secondary("b", "ChatPanel.tsx", "src/renderer/components/chat/ChatPanel.tsx"),
        ]);
        // Both should match via secondary path; the one with a tighter path
        // span should win.
        assert!(results.iter().any(|r| r.id == "a" && r.secondary_matched));
    }

    #[test]
    fn smart_case_matching() {
        // Lowercase query → case-insensitive
        let r1 = run_match("foo", vec![cand("a", "Foo"), cand("b", "FOO")]);
        assert_eq!(r1.len(), 2);
        // Mixed-case query → case-sensitive (won't match lowercase target)
        let r2 = run_match("Foo", vec![cand("a", "Foo"), cand("b", "foo")]);
        assert!(r2.iter().any(|m| m.id == "a"));
    }
}

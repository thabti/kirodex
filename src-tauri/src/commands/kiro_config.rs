use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KiroAgent {
    pub name: String,
    pub description: String,
    pub tools: Vec<String>,
    pub source: String,
    pub file_path: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KiroSkill {
    pub name: String,
    pub source: String,
    pub file_path: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KiroSteeringRule {
    pub name: String,
    pub always_apply: bool,
    pub source: String,
    pub excerpt: String,
    pub file_path: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KiroMcpServer {
    pub name: String,
    pub enabled: bool,
    pub transport: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub file_path: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct KiroConfig {
    pub agents: Vec<KiroAgent>,
    pub skills: Vec<KiroSkill>,
    pub steering_rules: Vec<KiroSteeringRule>,
    pub mcp_servers: Vec<KiroMcpServer>,
}

fn source_str(is_global: bool) -> &'static str {
    if is_global { "global" } else { "local" }
}

fn parse_steering_frontmatter(content: &str) -> (bool, String) {
    let mut always_apply = false;
    let mut body = content;
    if content.starts_with("---") {
        if let Some(end_idx) = content[3..].find("\n---") {
            let fm = &content[3..3 + end_idx];
            body = &content[3 + end_idx + 4..];
            if let Ok(parsed) = serde_yaml::from_str::<serde_yaml::Value>(fm) {
                always_apply = parsed.get("alwaysApply")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
            }
        }
    }
    let excerpt = body
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .take(1)
        .collect::<Vec<_>>()
        .join("");
    let excerpt = if excerpt.len() > 120 { excerpt[..120].to_string() } else { excerpt };
    (always_apply, excerpt)
}

fn scan_agents(base: &Path, is_global: bool) -> Vec<KiroAgent> {
    let dir = base.join("agents");
    let Ok(entries) = fs::read_dir(&dir) else { return vec![] };
    let source = source_str(is_global);
    entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let name = name.to_string_lossy();
            name.ends_with(".json") && !name.starts_with('.')
        })
        .filter_map(|e| {
            let fp = e.path();
            let raw: serde_json::Value = serde_json::from_str(&fs::read_to_string(&fp).ok()?).ok()?;
            let obj = raw.as_object()?;
            let file_name = fp.file_stem()?.to_string_lossy().to_string();
            Some(KiroAgent {
                name: obj.get("name").and_then(|v| v.as_str()).unwrap_or(&file_name).to_string(),
                description: obj.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                tools: obj.get("tools").and_then(|v| v.as_array()).map(|a| {
                    a.iter().filter_map(|v| v.as_str().map(String::from)).collect()
                }).unwrap_or_default(),
                source: source.to_string(),
                file_path: fp.to_string_lossy().to_string(),
            })
        })
        .collect()
}

fn scan_skills(base: &Path, is_global: bool) -> Vec<KiroSkill> {
    let dir = base.join("skills");
    let Ok(entries) = fs::read_dir(&dir) else { return vec![] };
    let source = source_str(is_global);
    entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            !name.to_string_lossy().starts_with('.')
                && (e.file_type().map_or(false, |t| t.is_dir() || t.is_symlink()))
        })
        .map(|e| {
            let skill_md = e.path().join("SKILL.md");
            let file_path = if skill_md.exists() {
                skill_md.to_string_lossy().to_string()
            } else {
                e.path().to_string_lossy().to_string()
            };
            KiroSkill {
                name: e.file_name().to_string_lossy().to_string(),
                source: source.to_string(),
                file_path,
            }
        })
        .collect()
}

fn scan_steering(base: &Path, is_global: bool) -> Vec<KiroSteeringRule> {
    let dir = base.join("steering");
    let Ok(entries) = fs::read_dir(&dir) else { return vec![] };
    let source = source_str(is_global);
    entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().ends_with(".md"))
        .filter_map(|e| {
            let fp = e.path();
            let content = fs::read_to_string(&fp).ok()?;
            let (always_apply, excerpt) = parse_steering_frontmatter(&content);
            Some(KiroSteeringRule {
                name: fp.file_stem()?.to_string_lossy().to_string(),
                always_apply,
                source: source.to_string(),
                excerpt,
                file_path: fp.to_string_lossy().to_string(),
            })
        })
        .collect()
}

fn scan_root_steering(kiro_dir: &Path, is_global: bool, existing: &[KiroSteeringRule]) -> Vec<KiroSteeringRule> {
    let Ok(entries) = fs::read_dir(kiro_dir) else { return vec![] };
    let source = source_str(is_global);
    entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().ends_with(".md"))
        .filter_map(|e| {
            let fp = e.path();
            let name = fp.file_stem()?.to_string_lossy().to_string();
            if existing.iter().any(|r| r.name == name && r.source == source) {
                return None;
            }
            let content = fs::read_to_string(&fp).ok()?;
            let (always_apply, excerpt) = parse_steering_frontmatter(&content);
            Some(KiroSteeringRule {
                name,
                always_apply,
                source: source.to_string(),
                excerpt,
                file_path: fp.to_string_lossy().to_string(),
            })
        })
        .collect()
}

fn load_mcp_file(file_path: &Path, enabled: bool, out: &mut Vec<KiroMcpServer>) {
    let Ok(content) = fs::read_to_string(file_path) else { return };
    let Ok(raw) = serde_json::from_str::<serde_json::Value>(&content) else { return };
    let Some(servers) = raw.get("mcpServers").and_then(|v| v.as_object()) else { return };
    let fp = file_path.to_string_lossy().to_string();
    for (name, cfg) in servers {
        let has_url = cfg.get("url").and_then(|v| v.as_str()).is_some();
        let has_command = cfg.get("command").and_then(|v| v.as_str()).is_some();
        let error = if !has_url && !has_command {
            Some("Missing command or url".to_string())
        } else if has_url {
            let url = cfg["url"].as_str().unwrap_or("");
            if !url.starts_with("http") { Some("Invalid url".to_string()) } else { None }
        } else {
            None
        };
        out.push(KiroMcpServer {
            name: name.clone(),
            enabled,
            transport: if has_url { "http".to_string() } else { "stdio".to_string() },
            command: cfg.get("command").and_then(|v| v.as_str()).map(String::from),
            args: cfg.get("args").and_then(|v| v.as_array()).map(|a| {
                a.iter().filter_map(|v| v.as_str().map(String::from)).collect()
            }),
            url: cfg.get("url").and_then(|v| v.as_str()).map(String::from),
            error,
            file_path: fp.clone(),
        });
    }
}

#[tauri::command]
pub fn get_kiro_config(project_path: Option<String>) -> KiroConfig {
    let mut config = KiroConfig::default();

    if let Some(home) = dirs::home_dir() {
        let global_kiro = home.join(".kiro");
        config.agents.extend(scan_agents(&global_kiro, true));
        config.skills.extend(scan_skills(&global_kiro, true));
        config.steering_rules.extend(scan_steering(&global_kiro, true));
        load_mcp_file(&global_kiro.join("settings").join("mcp.json"), true, &mut config.mcp_servers);
        load_mcp_file(&global_kiro.join("settings").join("mcp-disabled.json"), false, &mut config.mcp_servers);
    }

    if let Some(ref project) = project_path {
        let local_kiro = Path::new(project).join(".kiro");
        config.agents.extend(scan_agents(&local_kiro, false));
        config.skills.extend(scan_skills(&local_kiro, false));
        config.steering_rules.extend(scan_steering(&local_kiro, false));
        let root_rules = scan_root_steering(&local_kiro, false, &config.steering_rules);
        config.steering_rules.extend(root_rules);
        load_mcp_file(&local_kiro.join("settings").join("mcp.json"), true, &mut config.mcp_servers);
        load_mcp_file(&local_kiro.join("settings").join("mcp-disabled.json"), false, &mut config.mcp_servers);
    }

    config
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_frontmatter_with_always_apply_true() {
        let input = "---\nalwaysApply: true\n---\n# Title\nSome body text";
        let (always_apply, excerpt) = parse_steering_frontmatter(input);
        assert!(always_apply);
        assert_eq!(excerpt, "Some body text");
    }

    #[test]
    fn parse_frontmatter_with_always_apply_false() {
        let input = "---\nalwaysApply: false\n---\nBody here";
        let (always_apply, excerpt) = parse_steering_frontmatter(input);
        assert!(!always_apply);
        assert_eq!(excerpt, "Body here");
    }

    #[test]
    fn parse_frontmatter_missing_returns_false() {
        let input = "# No frontmatter\nJust content";
        let (always_apply, excerpt) = parse_steering_frontmatter(input);
        assert!(!always_apply);
        assert_eq!(excerpt, "Just content");
    }

    #[test]
    fn parse_frontmatter_skips_headings_in_excerpt() {
        let input = "---\nalwaysApply: true\n---\n# Heading\n## Subheading\nActual content";
        let (_, excerpt) = parse_steering_frontmatter(input);
        assert_eq!(excerpt, "Actual content");
    }

    #[test]
    fn parse_frontmatter_truncates_long_excerpt() {
        let long_line = "a".repeat(200);
        let input = format!("---\nalwaysApply: false\n---\n{}", long_line);
        let (_, excerpt) = parse_steering_frontmatter(&input);
        assert_eq!(excerpt.len(), 120);
    }

    #[test]
    fn parse_frontmatter_empty_body() {
        let input = "---\nalwaysApply: true\n---\n";
        let (always_apply, excerpt) = parse_steering_frontmatter(input);
        assert!(always_apply);
        assert_eq!(excerpt, "");
    }
}

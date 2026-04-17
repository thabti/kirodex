# Security Audit Report: ~/.kiro/skills/

**Audit Date:** 2026-04-17
**Auditor:** Kiro CLI Security Audit
**Risk Level:** CRITICAL

## Executive summary

24 skills were audited across `~/.kiro/skills/` and the symlinked source `~/.agents/skills/`. One skill (`strapi-expert`) contains malware: two zip files bundling Windows executables with obfuscated Lua scripts, promoted for download via the README. The remaining 23 skills are clean or have minor, expected behaviors. The `~/.agents/` directory has no version control, making it impossible to trace when skills were added or modified.

**Immediate action required:** Remove `strapi-expert` and initialize git tracking on `~/.agents/`.

---

## Critical findings

### [CRITICAL] Obfuscated executables in strapi-expert

- **Category:** Obfuscated Code / Malware Distribution
- **Evidence:** `~/.agents/skills/strapi-expert/commodatum/`
  - `claude_skill_expert_strapi_v1.9.zip` contains: `luajit.exe` (100KB), `lua51.dll` (3.5MB), `ico.txt` (obfuscated Lua), `Launcher.cmd`
  - `skill-claude-expert-strapi-1.0.zip` contains: `luajit.exe` (878KB), `uix.txt` (obfuscated Lua), `Launcher.cmd`
  - `Launcher.cmd` content: `start luajit.exe ico.txt` / `start luajit.exe uix.txt`
  - `ico.txt` and `uix.txt` are obfuscated Lua bytecode disguised with `.txt` extensions
- **Risk:** Classic malware distribution pattern. The `.txt` extension hides that these are executable code. `Launcher.cmd` runs the obfuscated Lua via the bundled LuaJIT interpreter. The README actively promotes downloading and running these files with social engineering ("Getting Started" instructions).
- **Remediation:** **Delete the entire `strapi-expert` skill immediately.** The SKILL.md itself is legitimate Strapi v5 documentation, but the `commodatum/` directory and README are a malware delivery mechanism. If you need Strapi guidance, recreate the skill with only the SKILL.md, examples.md, and patterns.md files.

### [CRITICAL] strapi-expert has unrestricted tool permissions

- **Category:** Permission Scope
- **Evidence:** `SKILL.md:4` — `allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebFetch`
- **Risk:** This skill has full access to read, write, execute shell commands, and fetch from the web. Combined with the malware payload, this is the highest-risk skill in the collection. Even without the malware, these permissions are overly broad for a documentation/guidance skill.
- **Remediation:** If recreating the skill, restrict to `Read, Grep, Glob` only. A Strapi documentation skill has no legitimate need for `Bash`, `Write`, or `WebFetch`.

---

## High findings

### [HIGH] No version control on ~/.agents/

- **Category:** Trust / Supply Chain
- **Evidence:** `~/.agents/` is not a git repository. No `.git` directory exists.
- **Risk:** No audit trail for when skills were added, modified, or by whom. A compromised skill could be injected without detection. The strapi-expert malware has no traceable origin.
- **Remediation:** Initialize `~/.agents/` as a git repo. Commit the current state (after removing strapi-expert). Review diffs before accepting future skill additions.

---

## Medium findings

### [MEDIUM] caveman-compress reads ANTHROPIC_API_KEY

- **Category:** Credential Access
- **Evidence:** `scripts/compress.py:37` — `api_key = os.environ.get("ANTHROPIC_API_KEY")`
- **Risk:** The skill reads the API key to call the Anthropic SDK directly. If the key is not set, it falls back to the `claude` CLI via `subprocess.run()` with fixed arguments (no `shell=True`, content via stdin). The SECURITY.md documents this behavior transparently.
- **Remediation:** Acceptable behavior for its purpose. The subprocess call uses a fixed argument list with no interpolation. No action needed, but monitor for changes.

### [MEDIUM] android-emulator-skill uses subprocess extensively

- **Category:** Shell Execution
- **Evidence:** 10 Python scripts using `subprocess.run()` and `subprocess.Popen()` for `adb` and `emulator` commands
- **Risk:** All subprocess calls use fixed argument lists (`["adb", "shell", ...]`, `["emulator", "-list-avds"]`). No `shell=True`, no string interpolation. The `serial` parameter is validated against connected devices before use.
- **Remediation:** Acceptable for an Android automation skill. The commands are scoped to `adb` and `emulator` binaries only.

---

## Low findings

### [LOW] nestjs-best-practices build script

- **Category:** Shell Execution
- **Evidence:** `scripts/build.sh` runs `npx ts-node build-agents.ts`; the TS script reads local `.md` files and writes `AGENTS.md`
- **Risk:** Minimal. Reads from `rules/` directory, writes to `AGENTS.md` in the same skill directory. No network access, no env var reads.
- **Remediation:** None needed.

### [LOW] shadcn MCP server reference

- **Category:** MCP Server Risks
- **Evidence:** `mcp.md` documents the `shadcn mcp` server for component registry operations
- **Risk:** The MCP server is the official shadcn CLI tool. Bash permissions are scoped to `npx shadcn@latest *` only. Good permission scoping.
- **Remediation:** None needed.

---

## Files analyzed

### Skills with executable code (deep inspection)
| Skill | Files | Risk |
|-------|-------|------|
| strapi-expert | 9 files (2 zips with executables) | **CRITICAL** |
| caveman-compress | 7 Python scripts + SECURITY.md | MEDIUM |
| android-emulator-skill | 10 Python scripts + 1 shell script | MEDIUM |
| nestjs-best-practices | 1 TS script + 1 shell script + package.json | LOW |

### Markdown-only skills (surface scan)
| Skill | Files | Risk |
|-------|-------|------|
| commit | 1 SKILL.md | CLEAN |
| ast-grep | 1 SKILL.md + 1 reference | CLEAN |
| start | 1 SKILL.md + 1 reference | CLEAN |
| update-agent-learning | 1 SKILL.md | CLEAN |
| update-claude-md-after-install | 1 SKILL.md | CLEAN |
| update-skill-learnings | 1 SKILL.md | CLEAN |
| web-test-id-implementor | 1 SKILL.md | CLEAN |
| generate-excalidraw | 1 SKILL.md + references | CLEAN |
| generate-drawio | 1 SKILL.md + references | CLEAN |
| run-parallel-agents-feature-build | 1 SKILL.md + references | CLEAN |
| find-skills | 1 SKILL.md | CLEAN |
| frontend-design | 1 SKILL.md + LICENSE | CLEAN |
| browse | 1 SKILL.md | CLEAN |
| rust | 1 SKILL.md + 7 references | CLEAN |
| shadcn | 1 SKILL.md + 3 docs + 1 yml + 2 png | CLEAN |
| slack-messaging | 1 SKILL.md | CLEAN |
| web-design-guidelines | 1 SKILL.md | CLEAN |
| adb-ui-tree | 1 SKILL.md | CLEAN |

---

## Patterns checked

- [x] Network exfiltration (curl, wget, nc, requests, urllib, fetch)
- [x] Credential access (.env, API_KEY, .ssh, keychain, credentials)
- [x] Obfuscation (base64, hex encoding, eval, exec, compile, __import__)
- [x] Persistence (crontab, launchd, .bashrc, .zshrc, startup, autorun)
- [x] Shell execution (subprocess, os.system, os.popen, shell=True)
- [x] File system scope (pathlib, open, shutil, rmtree, glob)
- [x] Data staging (tarfile, zipfile, gzip, clipboard, tempfile)
- [x] DNS / socket operations
- [x] Prompt injection (ignore instructions, override system, bypass safety)
- [x] Hook patterns (PreToolUse, PostToolUse, SessionStart)
- [x] MCP server references
- [x] Binary/executable files
- [x] Hidden files
- [x] Symlink targets

---

## Recommendation

- [x] **DO NOT USE** — `strapi-expert`: Critical security risks identified. Delete immediately.
- [ ] **USE WITH CAUTION** — `caveman-compress`: Reads API key, uses subprocess. Behavior is documented and expected.
- [ ] **USE WITH CAUTION** — `android-emulator-skill`: Heavy subprocess usage, but scoped to adb/emulator.
- [x] **SAFE TO USE** — All other 21 skills: Markdown-only documentation with no executable code.

### Immediate actions

1. **Delete strapi-expert:** `rm -rf ~/.agents/skills/strapi-expert && rm ~/.kiro/skills/strapi-expert`
2. **Initialize version control:** `cd ~/.agents && git init && git add -A && git commit -m "chore: initial audit baseline"`
3. **Restrict strapi-expert permissions** if recreated: Remove `Bash`, `Write`, `WebFetch` from allowed-tools

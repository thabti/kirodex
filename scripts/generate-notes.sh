#!/usr/bin/env bash
set -euo pipefail

# Generate grouped release notes from commits between two refs.
# Usage: generate-notes.sh [from-ref] [to-ref]
#   from-ref  defaults to the latest tag
#   to-ref    defaults to HEAD

FROM="${1:-$(git describe --tags --abbrev=0 2>/dev/null || echo "")}"
TO="${2:-HEAD}"

if [ -z "$FROM" ]; then
  echo "No previous tag found. Cannot generate notes."
  exit 1
fi

# Derive GitHub repo URL and owner from remote
REPO_URL=$(git remote get-url origin 2>/dev/null \
  | sed 's|git@github.com:|https://github.com/|' \
  | sed 's|\.git$||')
REPO_SLUG=$(echo "$REPO_URL" | sed 's|https://github.com/||')
REPO_OWNER=$(echo "$REPO_SLUG" | cut -d/ -f1)

# Look up the PR author for a commit via gh CLI. Returns empty for
# commits by the repo owner or when no associated PR is found.
pr_author_for_commit() {
  local hash="$1"
  if ! command -v gh &>/dev/null; then return; fi
  local author
  author=$(gh pr list --repo "$REPO_SLUG" --state merged --search "$hash" \
    --json author --jq '.[0].author.login' 2>/dev/null || true)
  if [ -n "$author" ] && [ "$author" != "$REPO_OWNER" ] && [ "$author" != "null" ]; then
    echo "$author"
  fi
}

# Collect commit hash + subject, skip release commits and CI SKIP
COMMITS=$(git log "${FROM}..${TO}" --pretty=format:"%H %s" \
  | grep -v "chore: release" \
  | grep -v "chore(analytics): update downloads.json" \
  | grep -v "\[CI SKIP\]" \
  | grep -v "^\s*$" || true)

if [ -z "$COMMITS" ]; then
  echo "No notable changes."
  exit 0
fi

declare -a FEAT FIX STYLE REFACTOR PERF DOCS BUILD CI TEST CHORE OTHER

while IFS= read -r line; do
  # Split hash from subject
  HASH="${line%% *}"
  SUBJECT="${line#* }"
  SHORT="${HASH:0:7}"
  LINK="[\`${SHORT}\`](${REPO_URL}/commit/${HASH})"
  # Extract type from conventional commit prefix (e.g., "feat(scope): desc" -> "feat")
  if [[ "$SUBJECT" =~ ^([a-z]+)(\(.+\))?!?:\ (.+)$ ]]; then
    TYPE="${BASH_REMATCH[1]}"
    DESC="${BASH_REMATCH[3]}"
    AUTHOR=$(pr_author_for_commit "$HASH")
    THANKS=""
    if [ -n "$AUTHOR" ]; then
      THANKS=" — thanks @${AUTHOR}"
    fi
    ENTRY="$DESC ($LINK)${THANKS}"
    case "$TYPE" in
      feat)     FEAT+=("$ENTRY") ;;
      fix)      FIX+=("$ENTRY") ;;
      style)    STYLE+=("$ENTRY") ;;
      refactor) REFACTOR+=("$ENTRY") ;;
      perf)     PERF+=("$ENTRY") ;;
      docs)     DOCS+=("$ENTRY") ;;
      build)    BUILD+=("$ENTRY") ;;
      ci)       CI+=("$ENTRY") ;;
      test)     TEST+=("$ENTRY") ;;
      chore)    CHORE+=("$ENTRY") ;;
      *)        OTHER+=("$SUBJECT ($LINK)") ;;
    esac
  else
    AUTHOR=$(pr_author_for_commit "$HASH")
    THANKS=""
    if [ -n "$AUTHOR" ]; then
      THANKS=" — thanks @${AUTHOR}"
    fi
    OTHER+=("$SUBJECT ($LINK)${THANKS}")
  fi
done <<< "$COMMITS"

print_section() {
  local heading="$1"
  shift
  local items=("$@")
  if [ ${#items[@]} -gt 0 ]; then
    echo "### $heading"
    echo ""
    for item in "${items[@]}"; do
      echo "- $item"
    done
    echo ""
  fi
}

print_section "Features"      "${FEAT[@]+"${FEAT[@]}"}"
print_section "Bug fixes"     "${FIX[@]+"${FIX[@]}"}"
print_section "Styling"       "${STYLE[@]+"${STYLE[@]}"}"
print_section "Refactoring"   "${REFACTOR[@]+"${REFACTOR[@]}"}"
print_section "Performance"   "${PERF[@]+"${PERF[@]}"}"
print_section "Documentation" "${DOCS[@]+"${DOCS[@]}"}"
print_section "Build"         "${BUILD[@]+"${BUILD[@]}"}"
print_section "CI"            "${CI[@]+"${CI[@]}"}"
print_section "Tests"         "${TEST[@]+"${TEST[@]}"}"
print_section "Chores"        "${CHORE[@]+"${CHORE[@]}"}"
print_section "Other changes" "${OTHER[@]+"${OTHER[@]}"}"

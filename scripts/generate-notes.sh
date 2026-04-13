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

# Collect one-line commit subjects, skip release commits and CI SKIP
COMMITS=$(git log "${FROM}..${TO}" --pretty=format:"%s" \
  | grep -v "^chore: release" \
  | grep -v "\[CI SKIP\]" \
  | grep -v "^\s*$" || true)

if [ -z "$COMMITS" ]; then
  echo "No notable changes."
  exit 0
fi

declare -a FEAT FIX STYLE REFACTOR PERF DOCS BUILD CI TEST CHORE OTHER

while IFS= read -r line; do
  # Extract type from conventional commit prefix (e.g., "feat(scope): desc" -> "feat")
  if [[ "$line" =~ ^([a-z]+)(\(.+\))?!?:\ (.+)$ ]]; then
    TYPE="${BASH_REMATCH[1]}"
    DESC="${BASH_REMATCH[3]}"
    case "$TYPE" in
      feat)     FEAT+=("$DESC") ;;
      fix)      FIX+=("$DESC") ;;
      style)    STYLE+=("$DESC") ;;
      refactor) REFACTOR+=("$DESC") ;;
      perf)     PERF+=("$DESC") ;;
      docs)     DOCS+=("$DESC") ;;
      build)    BUILD+=("$DESC") ;;
      ci)       CI+=("$DESC") ;;
      test)     TEST+=("$DESC") ;;
      chore)    CHORE+=("$DESC") ;;
      *)        OTHER+=("$line") ;;
    esac
  else
    OTHER+=("$line")
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

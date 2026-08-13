#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/bump-version.sh <major|minor|patch|x.y.z>
# Examples:
#   ./scripts/bump-version.sh patch   → 0.7.0 → 0.7.1
#   ./scripts/bump-version.sh minor   → 0.7.0 → 0.8.0
#   ./scripts/bump-version.sh major   → 0.7.0 → 1.0.0
#   ./scripts/bump-version.sh 1.2.3   → sets to 1.2.3 exactly

CURRENT=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "${1:-}" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  [0-9]*.[0-9]*.[0-9]*) IFS='.' read -r MAJOR MINOR PATCH <<< "$1" ;;
  *)
    echo "Usage: $0 <major|minor|patch|x.y.z>"
    echo "Current version: $CURRENT"
    exit 1
    ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"

if [ "$NEW" = "$CURRENT" ]; then
  echo "Synchronizing version files at $CURRENT"
else
  echo "Bumping $CURRENT → $NEW"
fi

replace_in_file() {
  local expression="$1"
  local file="$2"
  sed -i.bak "$expression" "$file"
  rm -f "${file}.bak"
}

# 1. package.json
replace_in_file "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" package.json

# 2. src-tauri/Cargo.toml (the only line-starting version is the package version)
replace_in_file 's/^version = "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"/version = "'"$NEW"'"/' src-tauri/Cargo.toml

# 3. src-tauri/tauri.conf.json
replace_in_file "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" src-tauri/tauri.conf.json

# 4. Update Cargo.lock
(cd src-tauri && cargo update -p kirodex 2>/dev/null || true)

PACKAGE_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')
CARGO_VERSION=$(sed -n 's/^version = "\([0-9]*\.[0-9]*\.[0-9]*\)"/\1/p' src-tauri/Cargo.toml | head -1)
TAURI_VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')

if [ "$PACKAGE_VERSION" != "$NEW" ] || [ "$CARGO_VERSION" != "$NEW" ] || [ "$TAURI_VERSION" != "$NEW" ]; then
  echo "Version synchronization failed: package=$PACKAGE_VERSION cargo=$CARGO_VERSION tauri=$TAURI_VERSION" >&2
  exit 1
fi

echo ""
echo "Updated:"
echo "  package.json          → $NEW"
echo "  src-tauri/Cargo.toml  → $NEW"
echo "  src-tauri/tauri.conf.json → $NEW"
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m \"chore: bump version to $NEW\""
echo "  git tag v$NEW && git push origin main --tags"

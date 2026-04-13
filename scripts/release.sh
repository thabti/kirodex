#!/usr/bin/env bash
set -euo pipefail

# Usage: bun run release              → bump patch, commit, tag, push
#        bun run release -- minor     → bump minor
#        bun run release -- major     → bump major
#        bun run release -- 1.2.3     → set exact version

BUMP="${1:-patch}"
SCRIPTS_DIR="$(dirname "$0")"
CO_AUTHOR="Co-authored-by: Kirodex <274876363+kirodex@users.noreply.github.com>"

# 1. Bump version
bash "$SCRIPTS_DIR/bump-version.sh" "$BUMP"

# 2. Get the new version and previous tag
VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')
TAG="v$VERSION"
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# 3. Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Tag $TAG already exists. Bump to a new version first."
  exit 1
fi

# 4. Generate release notes
echo "📝 Generating release notes since ${PREV_TAG:-beginning}..."
if [ -n "$PREV_TAG" ]; then
  NOTES=$(bash "$SCRIPTS_DIR/generate-notes.sh" "$PREV_TAG" HEAD)
else
  NOTES="Initial release."
fi

if [ -z "$NOTES" ]; then
  NOTES="Maintenance release."
fi

# 5. Prepend to CHANGELOG.md
DATE=$(date +%Y-%m-%d)
ENTRY="## [$TAG] - $DATE

$NOTES"

if [ -f CHANGELOG.md ]; then
  # Insert after the first line (# Changelog header)
  EXISTING=$(cat CHANGELOG.md)
  HEADER=$(head -1 CHANGELOG.md)
  REST=$(tail -n +2 CHANGELOG.md)
  printf '%s\n\n%s\n%s' "$HEADER" "$ENTRY" "$REST" > CHANGELOG.md
else
  printf '# Changelog\n\n%s\n' "$ENTRY" > CHANGELOG.md
fi

echo "   Updated CHANGELOG.md"

# 6. Commit
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "chore: release $TAG

$CO_AUTHOR"

# 7. Annotated tag with release notes
TAG_MSG="$TAG

$NOTES"
TMPFILE=$(mktemp)
echo "$TAG_MSG" > "$TMPFILE"
git tag -a "$TAG" -F "$TMPFILE"
rm -f "$TMPFILE"

# 8. Push commit + tag (triggers release workflow)
git push origin main --tags

echo ""
echo "🚀 Released $TAG"
echo "   CHANGELOG.md updated with grouped release notes."
echo "   Annotated tag created with release notes."
echo "   GitHub Actions will now build, sign, and publish the release."
echo "   Watch: gh run watch"

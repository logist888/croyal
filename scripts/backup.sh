#!/usr/bin/env bash
#
# Backup policy (see docs/BACKUP.md):
#   Run BEFORE coding in every run. Saves the current build to:
#     1. Git   — commit on the working branch + a `build-<N>` tag
#     2. Local — backups/current (rotating: previous <- current, current <- snapshot)
#   Depth is exactly 2 builds: from the 2nd run onward both CURRENT and PREVIOUS exist.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LABEL="${1:-build}"
mkdir -p backups

# --- 1. Local rotation: previous <- current, then snapshot working tree into current ---
if [ -d backups/current ]; then
  rm -rf backups/previous
  mv backups/current backups/previous
fi
mkdir -p backups/current

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='backups' \
    --exclude='dist' \
    ./ backups/current/
else
  # Fallback without rsync — tar handles spaces in filenames and the excludes safely.
  tar --exclude='./.git' --exclude='./node_modules' --exclude='./backups' --exclude='./dist' \
    -cf - . | tar -xf - -C backups/current
fi

# --- 2. Git backup: commit + tag ---
git add -A
if git diff --cached --quiet; then
  echo "Git: nothing to commit (working tree already saved)."
else
  git commit -m "backup: ${LABEL}" >/dev/null
  echo "Git: committed snapshot '${LABEL}'."
fi

# Keep a moving build tag. We only need current + previous, so force-move tags.
git tag -f "${LABEL}" >/dev/null 2>&1 || true

echo "Backup complete."
echo "  local current : backups/current"
echo "  local previous: $( [ -d backups/previous ] && echo 'backups/previous' || echo '(none yet — first run)')"
echo "  git tag       : ${LABEL}"

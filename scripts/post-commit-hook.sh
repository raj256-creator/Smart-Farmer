#!/bin/bash

if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  echo "[auto-push] GITHUB_PERSONAL_ACCESS_TOKEN is not set — skipping GitHub push."
  exit 0
fi

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REMOTE_URL" ]; then
  echo "[auto-push] No 'origin' remote found — skipping GitHub push."
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
  echo "[auto-push] Detached HEAD state — skipping GitHub push."
  exit 0
fi

SCRIPT_DIR="$(git rev-parse --show-toplevel)/scripts"
export GIT_ASKPASS="$SCRIPT_DIR/git-askpass.sh"

echo "[auto-push] Pushing to GitHub (branch: $BRANCH)..."
if git push origin "HEAD:refs/heads/$BRANCH" --quiet 2>&1; then
  echo "[auto-push] GitHub push successful."
else
  echo "[auto-push] Push failed (remote may have diverged). Sync GitHub manually if needed."
fi

exit 0

#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_DEST="$REPO_ROOT/.git/hooks/post-commit"
HOOK_SRC="$REPO_ROOT/scripts/post-commit-hook.sh"

if [ -f "$HOOK_SRC" ]; then
  cp "$HOOK_SRC" "$HOOK_DEST"
  chmod +x "$HOOK_DEST"
  echo "[auto-push] post-commit hook installed/refreshed."
fi

if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
    echo "[auto-push] Detached HEAD state — skipping GitHub push."
  else
    export GIT_ASKPASS="$REPO_ROOT/scripts/git-askpass.sh"
    echo "[auto-push] Pushing to GitHub (branch: $BRANCH)..."
    if git push origin "HEAD:refs/heads/$BRANCH" --quiet 2>&1; then
      echo "[auto-push] GitHub push successful."
    else
      echo "[auto-push] Push failed (remote may have diverged). Sync GitHub manually if needed."
    fi
  fi
else
  echo "[auto-push] GITHUB_PERSONAL_ACCESS_TOKEN not set — skipping GitHub push."
fi

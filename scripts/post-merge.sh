#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
  if [ -n "$REMOTE_URL" ]; then
    AUTH_URL=$(echo "$REMOTE_URL" | sed "s|https://|https://${GITHUB_PERSONAL_ACCESS_TOKEN}@|")
    BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
    echo "[auto-push] Pushing to GitHub (branch: $BRANCH)..."
    git push "$AUTH_URL" "HEAD:refs/heads/$BRANCH" --quiet
    echo "[auto-push] GitHub push successful."
  else
    echo "[auto-push] No 'origin' remote found — skipping GitHub push."
  fi
else
  echo "[auto-push] GITHUB_PERSONAL_ACCESS_TOKEN not set — skipping GitHub push."
fi

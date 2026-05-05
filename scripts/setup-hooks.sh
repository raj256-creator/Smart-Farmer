#!/bin/bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
git config --local core.hooksPath "$REPO_ROOT/scripts/hooks"
echo "[setup-hooks] core.hooksPath set to $REPO_ROOT/scripts/hooks"
echo "[setup-hooks] Auto-push to GitHub will trigger after every commit."
echo "[setup-hooks] Requires GITHUB_PERSONAL_ACCESS_TOKEN to be set."

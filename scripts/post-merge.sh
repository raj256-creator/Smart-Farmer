#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

REPO_ROOT="$(git rev-parse --show-toplevel)"

git config --local core.hooksPath "$REPO_ROOT/scripts/hooks"

bash "$REPO_ROOT/scripts/github-push.sh"

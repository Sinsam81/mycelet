#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

BRANCH_NAME="codex/next-steps"
COMMIT_MSG="Checkpoint: offline map + prediction v2 + billing hardening"

if ! command -v git >/dev/null 2>&1; then
  echo "Feil: git er ikke tilgjengelig i PATH."
  exit 1
fi

# Create branch if needed, otherwise switch to it
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
  git checkout "$BRANCH_NAME"
else
  git checkout -b "$BRANCH_NAME"
fi

git add .

if git diff --cached --quiet; then
  echo "Ingen endringer å committe."
else
  git commit -m "$COMMIT_MSG"
fi

git push -u origin "$BRANCH_NAME"

echo "Ferdig. Branch: $BRANCH_NAME"

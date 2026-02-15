#!/usr/bin/env bash
set -euo pipefail

# Basic syntax check for all Node scripts
for f in scripts/*.mjs scripts/*.js; do
  if [[ -f "$f" ]]; then
    echo "[syntax] $f"
    node --check "$f"
  fi
done

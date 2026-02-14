#!/usr/bin/env bash
set -euo pipefail

# Basic syntax check for all Node scripts
for f in scripts/*.js; do
  echo "[syntax] $f"
  node --check "$f"
done

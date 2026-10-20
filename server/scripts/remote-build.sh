#!/bin/bash
# Run on the managed server after the tree is in ~/popcorn-api.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/server"
if [[ -f "$HOME/.config/popcorn/env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$HOME/.config/popcorn/env"
  set +a
fi
export POPCORN_SERVER=1
export POPCORN_DATA_DIR="${POPCORN_DATA_DIR:-$HOME/.cache/popcorn-api}"
mkdir -p "$POPCORN_DATA_DIR" "$ROOT/logs"
npm ci
npm run build
node dist/migrate.js
echo "build ok"
cd "$ROOT/website"
npm ci
npm run build
echo "website ok"

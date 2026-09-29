#!/bin/bash
# konsoleH cron entry. Example schedule: once every six hours.
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
node dist/refresh.js

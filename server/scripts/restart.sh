#!/bin/bash
# konsoleH keeps the domain socket open and starts this process on the next request.
# Exiting the current process is how a deploy picks up a new build.
set -euo pipefail
pattern='bin/node server/dist/index.js'
if ! pgrep -f "$pattern" >/dev/null 2>&1; then
  echo "api process was not running"
  exit 0
fi
pkill -f "$pattern" || true
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if ! pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "api process stopped"
    exit 0
  fi
  sleep 0.5
done
echo "api process did not exit" >&2
exit 1

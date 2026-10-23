#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd "$(dirname "$0")"
npm approve-scripts better-sqlite3 esbuild || true
npm rebuild better-sqlite3 || npm install better-sqlite3 --build-from-source
node check-sqlite.mjs

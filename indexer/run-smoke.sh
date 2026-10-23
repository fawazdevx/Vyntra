#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd "$(dirname "$0")"

# API-only smoke (no factory required)
npx tsx -e "
import { createApp } from './src/api.ts'
import { getDb } from './src/db.ts'
getDb()
const app = createApp()
const health = await app.request('/health')
const stats = await app.request('/v1/stats')
const launches = await app.request('/v1/launches')
console.log('health', await health.json())
console.log('stats', await stats.json())
console.log('launches', await launches.json())
console.log('smoke ok')
"

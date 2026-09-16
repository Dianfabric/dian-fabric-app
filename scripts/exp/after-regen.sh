#!/bin/bash
# Runs automatically after regen-embeddings-v4.ts finishes: retry missing rows, then evaluate against the full DB.
cd "$(dirname "$0")/../.."
log() { echo "[$(date +%H:%M:%S)] $*"; }
while pgrep -f "regen-embeddings-v4.ts" > /dev/null; do sleep 30; done
log "regen finished; retry missing rows"
DINO_DTYPE=fp32 DINO_CACHE_DIR=scripts/exp/hf-cache node --experimental-strip-types scripts/regen-embeddings-v4.ts --only-missing 2>&1 | grep -v "Warning\|Reparsing\|type\": \"module\|trace-warnings" | tail -3
log "missing after retry: $(node scripts/exp/data/missing.mjs)"
log "eval-db golden+synth"
DINO_DTYPE=fp32 DINO_CACHE_DIR=scripts/exp/hf-cache node --experimental-strip-types scripts/exp/eval-db.ts both 2>&1 | grep -v "Warning\|Reparsing\|type\": \"module\|trace-warnings"
log "after-regen done"

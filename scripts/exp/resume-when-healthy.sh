#!/bin/bash
# Wait until the DB answers count_missing_v4 quickly 3 times in a row, then resume the regeneration gently
# and queue the post-regeneration chain.
cd "$(dirname "$0")/../.."
log() { echo "[$(date +%H:%M:%S)] $*"; }
ok=0
while [ $ok -lt 3 ]; do
  t0=$(date +%s); out=$(node scripts/exp/data/missing.mjs 2>&1); dt=$(( $(date +%s) - t0 ))
  if echo "$out" | grep -qE "missing [0-9]+" && [ $dt -le 3 ]; then ok=$((ok+1)); else ok=0; fi
  log "health: $out (${dt}s) streak=$ok"
  [ $ok -lt 3 ] && sleep 30
done
log "DB stable; resuming regeneration (write concurrency 2)"
DINO_DTYPE=fp32 DINO_CACHE_DIR=scripts/exp/hf-cache node --experimental-strip-types scripts/regen-embeddings-v4.ts --only-missing > scripts/exp/data/regen-v4.log 2>&1
log "regen exited; queue after-regen"
./scripts/exp/after-regen.sh > scripts/exp/data/after-regen.log 2>&1
log "all done"

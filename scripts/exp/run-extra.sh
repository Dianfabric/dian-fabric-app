#!/bin/bash
# Waits for run-all.sh to finish, then adds the q4f16 variant (pool + synth) and re-runs both evals.
cd "$(dirname "$0")/../.."
log() { echo "[$(date +%H:%M:%S)] $*"; }
while pgrep -f "scripts/exp/run-all.sh" > /dev/null; do sleep 30; done
log "extra: embed pool q4f16"; node scripts/exp/embed.mjs q4f16 | tail -1
log "extra: embed synth q4f16"; node scripts/exp/embed.mjs q4f16 scripts/exp/data/synth synth | tail -1
log "extra: eval golden"; node scripts/exp/eval.mjs
log "extra: eval synth"; node scripts/exp/eval-synth.mjs
log "extra done"

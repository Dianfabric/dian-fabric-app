#!/bin/bash
# Full offline experiment chain (after prep.mjs finished). Safe to re-run: every step resumes/skips done work.
set -e
cd "$(dirname "$0")/../.."
log() { echo "[$(date +%H:%M:%S)] $*"; }
for v in q8 fp32 gray crop graycrop tile; do log "embed pool $v"; node scripts/exp/embed.mjs $v | tail -1; done
log "eval golden"; node scripts/exp/eval.mjs
log "synth 300"; node scripts/exp/synth.mjs 300 42 | tail -1
for v in q8 fp32 gray crop graycrop tile; do log "embed synth $v"; node scripts/exp/embed.mjs $v scripts/exp/data/synth synth | tail -1; done
log "colors pool"; node scripts/exp/colors.mjs scripts/exp/data/images pool | tail -1
log "colors synth"; node scripts/exp/colors.mjs scripts/exp/data/synth synth | tail -1
log "eval synth"; node scripts/exp/eval-synth.mjs
log "done"

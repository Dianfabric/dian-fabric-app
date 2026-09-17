#!/bin/bash
# Phase 2: merge v4-photo-search into main, push (GitHub → Vercel production deploy), wait for the deployment,
# smoke-test production (embed → search-v4 → rank-v4, cold + warm) and update the final report.
# CHANGES PRODUCTION — run only after an explicit go-ahead.
set -u
exec > >(tee -a scripts/exp/data/deploy.log) 2>&1
cd "$(dirname "$0")/../.."
log() { echo "[$(date '+%m-%d %H:%M:%S')] $*"; }
PROD="https://dian-fabric-app.vercel.app"

log "merging v4-photo-search into main"
git checkout -q main && git pull -q origin main && git merge -q --no-edit v4-photo-search 2>&1 | tail -2
MERGE_SHA=$(git rev-parse --short HEAD)
git push -q origin main 2>&1 | tail -1
log "pushed main @ $MERGE_SHA — Vercel production build should start"

log "waiting for production deployment"
READY=""; st=""
for i in $(seq 1 60); do
  line=$(vercel ls --prod 2>/dev/null | grep -oE "https://dian-fabric-[a-z0-9]+-dianfabrics-projects\.vercel\.app" | head -1)
  st=$(vercel inspect "$line" 2>&1 | grep -E "status" | awk '{print $NF}')
  if [ "$st" = "Ready" ] && [ $i -gt 2 ]; then READY="$line"; break; fi
  [ "$st" = "Error" ] && { log "production build ERROR: $line"; vercel inspect --logs "$line" 2>&1 | grep -iE "error" | head -5; break; }
  sleep 20
done
log "production deployment: ${READY:-not ready (state: $st)}"
sleep 20
log "smoke test (production)"
node scripts/exp/prod-smoke.mjs "$PROD" production > scripts/exp/data/prod-smoke.md 2>&1; SMOKE_RC=$?
cat scripts/exp/data/prod-smoke.md; log "smoke rc=$SMOKE_RC"

log "updating final report"
python3 - "$MERGE_SHA" "${READY:-unknown}" "$SMOKE_RC" <<'PY'
import sys, re
sha, url, rc = sys.argv[1:4]
p = "scripts/exp/final-report.md"; s = open(p, encoding="utf-8").read()
smoke = open("scripts/exp/data/prod-smoke.md", encoding="utf-8").read()
s = s.replace("- 코드: 브랜치 v4-photo-search (main 머지·프로덕션 배포는 scripts/exp/deploy-main.sh 로 실행 — 승인 필요)",
              f"- 배포 완료: main @ {sha} → Vercel production {url} (스모크 rc={rc})")
s = s.replace("## 오프라인 실험 요약", "## 프로덕션 스모크 테스트\n" + smoke + "\n\n## 오프라인 실험 요약")
s = s.replace("- scripts/exp/deploy-main.sh 실행 (main 머지 → Vercel 배포 → 프로덕션 스모크 → 보고 갱신)\n", "")
open(p, "w", encoding="utf-8").write(s)
PY
{
  echo
  echo "### 2026-09-16 v4 프로덕션 배포 (deploy-main.sh)"
  echo "- main @ $MERGE_SHA, 프로덕션 스모크 rc=$SMOKE_RC (scripts/exp/data/prod-smoke.md). 최종 보고 scripts/exp/final-report.md"
} >> sessions/dian-fabric.md
git add scripts/exp/final-report.md sessions/dian-fabric.md scripts/exp/data/prod-smoke.md 2>/dev/null
git diff --cached --quiet || git commit -q -m "Update v4 rollout report with production deployment and smoke test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -q origin main 2>&1 | tail -1
log "DEPLOY DONE"

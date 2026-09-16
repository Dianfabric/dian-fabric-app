#!/bin/bash
# Phase 1 finisher (unattended, no production changes):
#   1. wait for the regeneration + after-regen chain (retry missing rows, full-DB evaluation)
#   2. make sure results-db.md exists (re-run eval-db if the chain was cut short)
#   3. write scripts/exp/final-report.md (pre-deploy version) and commit it to the feature branch
# Phase 2 (merge to main → production deploy → production smoke test) is scripts/exp/deploy-main.sh
# and needs an explicit go-ahead because it changes production.
set -u
cd "$(dirname "$0")/../.."
log() { echo "[$(date '+%m-%d %H:%M:%S')] $*"; }
ENV="DINO_DTYPE=fp32 DINO_CACHE_DIR=scripts/exp/hf-cache"

log "waiting for regen / after-regen to finish"
while pgrep -f "regen-embeddings-v4.ts|after-regen.sh" > /dev/null; do sleep 60; done
log "chain finished. $(node scripts/exp/data/missing.mjs 2>&1)"
if ! grep -q "after-regen done" scripts/exp/data/after-regen.log 2>/dev/null || [ ! -s scripts/exp/results-db.md ]; then
  log "after-regen incomplete — running retry + eval-db now"
  env $ENV node --experimental-strip-types scripts/regen-embeddings-v4.ts --only-missing 2>&1 | grep -v "Warning\|Reparsing\|module\|trace" | tail -2
  env $ENV node --experimental-strip-types scripts/exp/eval-db.ts both 2>&1 | grep -v "Warning\|Reparsing\|module\|trace" | tail -40
fi
MISSING=$(node scripts/exp/data/missing.mjs 2>&1 | grep -oE "missing [0-9]+" | awk '{print $2}')
FAILS=$(wc -l < scripts/regen-v4-failures.log | tr -d ' ')
log "regen summary: missing=${MISSING:-?} failure-log-lines=${FAILS}"

log "local smoke test against the dev server (if running)"
DEV=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E "next-server|node" | grep -oE ":[0-9]{5}" | head -1 | tr -d ':')
if [ -n "$DEV" ]; then node scripts/exp/prod-smoke.mjs "http://localhost:$DEV" local-dev > scripts/exp/data/local-smoke.md 2>&1; cat scripts/exp/data/local-smoke.md; fi

log "writing final report (pre-deploy)"
{
  echo "# v4 사진 유사검색 — 최종 보고 ($(date '+%Y-%m-%d %H:%M'))"
  echo
  echo "## 상태"
  echo "- 코드: 브랜치 v4-photo-search (main 머지·프로덕션 배포는 scripts/exp/deploy-main.sh 로 실행 — 승인 필요)"
  echo "- 서버 임베딩 dtype: fp16 (DINO_DTYPE), 모델 캐시 /tmp/hf-cache, Vercel Production/Preview env 등록 완료"
  echo "- 검색 페이지: 서버 임베딩 v4 기본, 실패 시 브라우저 경로 자동 폴백 (NEXT_PUBLIC_SEARCH_V4=0 으로 강제 구경로)"
  echo
  echo "## DB 재생성"
  echo "- 전체 16,683행 중 emb_v4 미생성: ${MISSING:-?}행 (이미지 없음/다운로드 실패 포함)"
  echo "- 실패 로그 누적 ${FAILS}줄 (statement timeout 재시도 포함, scripts/regen-v4-failures.log)"
  echo "- 인덱스: HNSW 제거 → IVFFlat(lists 100, probes 20, statement_timeout 25s). HNSW 삽입 부하로 9/15 DB 장애 2회"
  echo
  echo "## 실제 DB 전체 평가 (scripts/exp/results-db.md)"
  sed -n '3,200p' scripts/exp/results-db.md 2>/dev/null || echo "(results-db.md 없음 — eval-db 재실행 필요)"
  echo
  echo "## 로컬 스모크 테스트 (개발 서버)"
  cat scripts/exp/data/local-smoke.md 2>/dev/null || echo "(개발 서버 미실행)"
  echo
  echo "## 오프라인 실험 요약"
  echo "- 골든셋(풀 2,398, 75쿼리) R@15: 채택 조합 80.1% (DB 자체 벡터 78.7%, 독립 fp32 CLS 71.8%, 운영 q8×fp32 조합 1.8%)"
  echo "- 합성 폰사진 300장 R@15 94.3% / R@1 75.3% (mild 97.5 / medium 97.1 / hard 90.4)"
  echo "- 상세: scripts/exp/results-golden.md, scripts/exp/results-synth.md"
  echo
  echo "## 남은 일"
  echo "- scripts/exp/deploy-main.sh 실행 (main 머지 → Vercel 배포 → 프로덕션 스모크 → 보고 갱신)"
  echo "- 실제 폰사진 20~30장으로 합성셋 대비 검증 (사용자 촬영 필요)"
  echo "- fabric.diantex.kr DNS 레코드 복구 (NXDOMAIN, hostcocoa)"
  echo "- 구 검색 경로(dino-client, search-dino, rank-fabrics) 제거는 v4 안정 확인 후"
} > scripts/exp/final-report.md
git add scripts/exp/final-report.md scripts/exp/results-db.md sessions/dian-fabric.md 2>/dev/null
git diff --cached --quiet || git commit -q -m "Add full-DB v4 evaluation and pre-deploy report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -q origin v4-photo-search 2>&1 | tail -1
log "PHASE 1 DONE — report: scripts/exp/final-report.md (deploy pending)"

# v4 사진 유사검색 — 최종 보고 (2026-09-16 19:01)

## 상태
- 코드: 브랜치 v4-photo-search (main 머지·프로덕션 배포는 scripts/exp/deploy-main.sh 로 실행 — 승인 필요)
- 서버 임베딩 dtype: fp16 (DINO_DTYPE), 모델 캐시 /tmp/hf-cache, Vercel Production/Preview env 등록 완료
- 검색 페이지: 서버 임베딩 v4 기본, 실패 시 브라우저 경로 자동 폴백 (NEXT_PUBLIC_SEARCH_V4=0 으로 강제 구경로)

## DB 재생성
- 전체 16,683행 중 emb_v4 미생성: 0행 (이미지 없음/다운로드 실패 포함)
- 실패 로그 누적 913줄 (statement timeout 재시도 포함, scripts/regen-v4-failures.log)
- 인덱스: HNSW 제거 → IVFFlat(lists 100, probes 20, statement_timeout 25s). HNSW 삽입 부하로 9/15 DB 장애 2회

## 실제 DB 전체 평가 (scripts/exp/results-db.md)
## Golden set vs FULL DB (75 queries, candidates 500∪500) — desktop baseline: R@15 50.2 % / P@5 13.6 % / MRR 0.335

| method | R@15 | P@5 | MRR | R@1 |
|---|---|---|---|---|
| v4 full (cls45 crop35 lab20) | 52.4% | 14.1% | 0.432 | 30.7% |
| cls only | 40.8% | 9.1% | 0.314 | 22.7% |
| crop mean only | 36.0% | 9.6% | 0.338 | 26.7% |
| cls50 crop50 | 45.0% | 10.9% | 0.330 | 22.7% |
| cls45 crop35 lab10 rgb10 | 56.1% | 15.2% | 0.382 | 24.0% |

## Synthetic phone photos vs FULL DB (300 queries)

| method | R@1 exact | R@15 exact | R@15 design | MRR | n |
|---|---|---|---|---|---|
| v4 full (cls45 crop35 lab20) | 60.3% | 88.0% | 91.7% | 0.699 | 300 |
| v4 full (cls45 crop35 lab20) [medium] | 61.3% | 89.8% | 93.4% | 0.713 | 137 |
| cls only | 46.3% | 78.7% | 86.7% | 0.570 | 300 |
| cls only [medium] | 43.1% | 82.5% | 89.1% | 0.564 | 137 |
| crop mean only | 64.0% | 90.0% | 94.0% | 0.738 | 300 |
| crop mean only [medium] | 64.2% | 93.4% | 94.9% | 0.749 | 137 |
| cls50 crop50 | 60.3% | 90.0% | 93.7% | 0.706 | 300 |
| cls50 crop50 [medium] | 59.9% | 92.0% | 96.4% | 0.712 | 137 |
| cls45 crop35 lab10 rgb10 | 62.0% | 89.3% | 92.3% | 0.722 | 300 |
| cls45 crop35 lab10 rgb10 [medium] | 65.0% | 89.8% | 94.2% | 0.747 | 137 |
| v4 full (cls45 crop35 lab20) [mild] | 75.0% | 95.0% | 97.5% | 0.836 | 80 |
| cls only [mild] | 67.5% | 90.0% | 95.0% | 0.739 | 80 |
| crop mean only [mild] | 82.5% | 97.5% | 98.8% | 0.881 | 80 |
| cls50 crop50 [mild] | 76.3% | 95.0% | 97.5% | 0.830 | 80 |
| cls45 crop35 lab10 rgb10 [mild] | 76.3% | 95.0% | 96.3% | 0.843 | 80 |
| v4 full (cls45 crop35 lab20) [hard] | 44.6% | 78.3% | 83.1% | 0.545 | 83 |
| cls only [hard] | 31.3% | 61.4% | 74.7% | 0.416 | 83 |
| crop mean only [hard] | 45.8% | 77.1% | 88.0% | 0.581 | 83 |
| cls50 crop50 [hard] | 45.8% | 81.9% | 85.5% | 0.577 | 83 |
| cls45 crop35 lab10 rgb10 [hard] | 43.4% | 83.1% | 85.5% | 0.564 | 83 |

## 로컬 스모크 테스트 (개발 서버)
| target | step | wall | detail |
|---|---|---|---|
| local-dev | embed (cold) | 795 ms | dtype fp16, server 748 ms |
| local-dev | search-v4 (cold) | 2029 ms | 644 candidates, server 2019 ms, source rank 1, top1 DOLLAR-20 |
| local-dev | embed (warm) | 626 ms | dtype fp16, server 620 ms |
| local-dev | search-v4 (warm) | 595 ms | 644 candidates, server 586 ms, source rank 1, top1 DOLLAR-20 |
| local-dev | rank-v4 (Gemini, top 20) | 16958 ms | gemini-2.5-flash, server 16945 ms, source rank after rerank 1, top score 0 |

## 오프라인 실험 요약
- 골든셋(풀 2,398, 75쿼리) R@15: 채택 조합 80.1% (DB 자체 벡터 78.7%, 독립 fp32 CLS 71.8%, 운영 q8×fp32 조합 1.8%)
- 합성 폰사진 300장 R@15 94.3% / R@1 75.3% (mild 97.5 / medium 97.1 / hard 90.4)
- 상세: scripts/exp/results-golden.md, scripts/exp/results-synth.md

## 남은 일
- scripts/exp/deploy-main.sh 실행 (main 머지 → Vercel 배포 → 프로덕션 스모크 → 보고 갱신)
- 실제 폰사진 20~30장으로 합성셋 대비 검증 (사용자 촬영 필요)
- fabric.diantex.kr DNS 레코드 복구 (NXDOMAIN, hostcocoa)
- 구 검색 경로(dino-client, search-dino, rank-fabrics) 제거는 v4 안정 확인 후

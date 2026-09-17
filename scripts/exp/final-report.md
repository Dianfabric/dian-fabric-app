# v4 사진 유사검색 — 최종 보고 (2026-09-16 19:01)

## 상태
- 배포 완료: main @ f4ed0b1 (080f3b6 머지 + Vercel 번들 수정 2건) → Vercel production https://dian-fabric-buttumn6q-dianfabrics-projects.vercel.app (스모크 rc=1)
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

## 로컬 스모크 테스트 (개발 서버, Gemini 재랭킹 수정 후)
| target | step | wall | detail |
|---|---|---|---|
| local-dev | embed (cold) | 1180 ms | dtype fp16, server 1121 ms |
| local-dev | search-v4 (cold) | 756 ms | 644 candidates, server 727 ms, source rank 1, top1 DOLLAR-20 |
| local-dev | embed (warm) | 707 ms | dtype fp16, server 697 ms |
| local-dev | search-v4 (warm) | 967 ms | 644 candidates, server 958 ms, source rank 1, top1 DOLLAR-20 |
| local-dev | rank-v4 (Gemini, top 20) | 9492 ms | gemini-2.5-flash, server 9479 ms, source rank after rerank 1, top score 95 |


## 프로덕션 스모크 테스트 (main @ f4ed0b1, 2026-09-17 09:58)
| target | step | wall | detail |
|---|---|---|---|
| production | embed (cold) | 21568 ms | dtype fp16, server 18761 ms |
| production | search-v4 (cold) | 5435 ms | 643 candidates, server 3792 ms, source rank 1, top1 DOLLAR-20 |
| production | embed (warm) | 2831 ms | dtype fp16, server 1867 ms |
| production | search-v4 (warm) | 2175 ms | 643 candidates, server 1182 ms, source rank 1, top1 DOLLAR-20 |
| production | rank-v4 (Gemini, top 20) | 11023 ms | gemini-2.5-flash, server 10218 ms, source rank after rerank 1, top score 95 |

- 콜드스타트 21.6초 = fp16 모델(174MB) 다운로드+로드. 웜 상태 임베딩 1.9초, 검색 1.2초, Gemini 재랭킹 10초
- 콜드스타트를 줄이려면 DINO_DTYPE=q4f16(50MB, 골든셋 약 5점 손해) 또는 Vercel 함수 워밍 필요

## 색상 우선 정책 (2026-09-17 추가, main @ 5bd75fa)
- 사용자 요구: 색상이 비슷한 원단을 우선. 실제 DB로 색상 비중 30/40%와 게이트(유사도 기준 미만 강등)를 비교 (scripts/exp/results-db-colour.md)
- 채택: 색상 비중 20% → 40% (CLS 35 / 크롭 25 / LAB 40). 골든셋 R@15 52.4 → 57.1%, R@1 30.7 → 40.0%, MRR 0.432 → 0.513. 합성 폰사진 R@15 88 → 80% (조명 색편향 사진에서 손해)
- 게이트는 두 세트 모두 비중 상향보다 못해 기본 OFF (코드에 남김). 되돌리기: body.colorMode "normal" 또는 SEARCH_V4_COLOR_MODE=normal
- 배포 후 프로덕션 스모크:
| target | step | wall | detail |
|---|---|---|---|
| production | embed (cold) | 10326 ms | dtype fp16, server 7427 ms |
| production | search-v4 (cold) | 5075 ms | 643 candidates, server 3725 ms, source rank 1, top1 DOLLAR-20 |
| production | embed (warm) | 3477 ms | dtype fp16, server 2363 ms |
| production | search-v4 (warm) | 1921 ms | 643 candidates, server 1128 ms, source rank 1, top1 DOLLAR-20 |
| production | rank-v4 (Gemini, top 20) | 10959 ms | gemini-2.5-flash, server 10144 ms, source rank after rerank 1, top score 95 |

## 2026-09-17 실제 폰사진 피드백 반영 (main @ 01db01f)
사용자 테스트에서 드러난 문제 3건과 조치:
1. **퍼플 사진 → 그레이 결과**: 색차 계산이 관대(ΔE 10을 유사 취급). → CIE94 기반 색차, 명도 비중 1/4, 유채색↔무채색 절반 감점, 색상 비중 45%, 점진 감점(게이트 없음). 전체 DB 골든셋 R@15 52.4 → **64.1%**, R@1 30.7 → **44.0%**, MRR 0.432 → **0.557** (results-db-colour2.md).
2. **스트라이프 사진 → 무지 결과**: 패턴 힌트가 +0.03 보너스뿐. → 일치 +0.05, 불일치 −0.03, 패턴 쿼리에 무지 −0.08. 재랭킹 프롬프트를 색상 계열 → 패턴 종류 → 질감 순으로 변경.
3. **보유 원단(FIZE-11, ECOTONE-02)이 후보에 없음**: 폰 근접 촬영은 조직이 2~3배 크게 보여 카탈로그 벡터와 유사도 0.4까지 하락. → 쿼리를 2×2/3×3 모자이크로 이어 붙여 축소 배율 임베딩 추가, 배율별 kNN 병렬 실행 후 후보별 최대값. FIZE-11 30% 확대 변형: 22위 → 1위. 실제 폰사진: 100위 밖 → 검색 7위 → Gemini 재랭킹 후 **2위**.
- 실제 쿼리 사진 자동 수집: SEARCH_QUERY_CAPTURE=1, 비공개 버킷 search-queries, 재현 스크립트 scripts/exp/pull-queries.mjs / prod-cases.mjs
- 비용: 임베딩 웜 1.6 → 4.5초, 검색 1.1 → 3.4초(배율 3개 kNN). 필요 시 3×3 생략으로 단축 가능
- 남은 과제: 카탈로그 사진이 어둡게 찍힌 원단(FIZE-11 명도 13~29)은 폰사진과 색상 점수가 낮게 나옴(0.47). 재랭킹이 보정하지만 검색 단계 개선 여지 있음. ECOTONE-02 실제 사진은 아직 미수집.

## 2026-09-17 오후: 실제 폰사진 9장 검증과 색상 칩 (main @ aa3bbbd)
사용자가 찍은 실제 사진 9장(CITRON-01, RIDGE-31, CARIO-07, ECOTONE-21, FIZE-11, PS3088-19, G1948-05, G8044-04, G8043-03/05) 결과:

| 원단 | 사진 색 그대로 (검색 → 재랭킹) | 정답 색상 칩 지정 |
|---|---|---|
| PS3088-19 (레드 큐브) | 1위 → 1위 | 1위 → 1위 |
| RIDGE-31 (옐로우 헤링본) | 2위 → 1위 | 2위 → 3위 |
| FIZE-11 (네이비 부클) | 10위 → 6~13위 | 95위 |
| CARIO-07 (핑크 도비) | 100위 밖 | 53위 |
| CITRON-01 (아이보리 평직) | 100위 밖 | 100위 밖 |
| ECOTONE-21 (그린 트위드) | 100위 밖 | 100위 밖 |

- 패턴·색이 뚜렷한 원단(큐브, 헤링본)은 잘 잡힘. **무지·평직·부클처럼 비슷한 질감이 수백 개인 원단은 정확한 SKU를 못 고름** — 사진 vs 카탈로그 유사도(0.73~0.9)가 낮은 게 아니라, 더 높은 다른 원단이 수백 개 있음. DINOv2 224px의 미세 질감 구분 한계(ONNX 모델이 224 고정이라 448 불가).
- 폰 색 편향: 아이보리가 블루로 찍힘. 무채색에 가까운 사진은 화이트밸런스 보정 비교(0.04 → 0.85)로 완화. 카탈로그 색상 이름은 부정확(아이보리→베이지, 네이비→차콜)해서 이름 기반 채널·점수는 약하게만 사용.
- 색상 칩(사용자 지정): 사진 색을 대체하면 손해(RIDGE 2→23위)라 **추가 신호**로만 사용. 칩 채널 SQL `search_fabrics_v4_color`(색상명 필터 kNN). 효과는 케이스별로 엇갈림(CARIO 개선, FIZE 악화).
- 카탈로그 사진 문제: CARIO-07은 카탈로그가 갈색으로 찍혀 있음(실물 핑크) → 사진 교체 필요.
- 다음 단계 후보: ① 실제 촬영 사진(자동 수집 버킷 search-queries)에 정답 라벨을 달아 폰사진↔카탈로그 매칭용 프로젝션 헤드 학습 ② 무지 원단은 색상+조직 종류(부클/평직/트위드)로 좁힌 뒤 재랭킹 후보를 20→40개로 확대 ③ 카탈로그 촬영 표준화(밝기·배율).

## 오프라인 실험 요약
- 골든셋(풀 2,398, 75쿼리) R@15: 채택 조합 80.1% (DB 자체 벡터 78.7%, 독립 fp32 CLS 71.8%, 운영 q8×fp32 조합 1.8%)
- 합성 폰사진 300장 R@15 94.3% / R@1 75.3% (mild 97.5 / medium 97.1 / hard 90.4)
- 상세: scripts/exp/results-golden.md, scripts/exp/results-synth.md

## 배포 직전 발견·수정한 것
- Vercel 함수에 onnxruntime 리눅스 네이티브 라이브러리가 누락(outputFileTracingIncludes로 포함), 함수 크기 390MB 초과(다른 OS 바이너리·wasm 제외 + VERCEL_SUPPORT_LARGE_FUNCTIONS=1)
- Vercel의 GEMINI_API_KEY 값 끝에 개행 문자가 들어 있었음 → Production/Preview 모두 정리된 값으로 재등록, 맥미니 .env.local도 수정
- Gemini 2.5 Flash 기본 thinking 토큰이 출력 한도를 잠식해 재랭킹 JSON이 잘림 → thinkingBudget 0, maxOutputTokens 8192, 파싱 실패 로그 추가. 20개 후보 재랭킹 9~17초

## 남은 일
- 실제 폰사진 20~30장으로 합성셋 대비 검증 (사용자 촬영 필요)
- fabric.diantex.kr DNS 레코드 복구 (NXDOMAIN, hostcocoa)
- 구 검색 경로(dino-client, search-dino, rank-fabrics) 제거는 v4 안정 확인 후

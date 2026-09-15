# 맥미니 세션 인수인계 (2026-09-15, 데스크탑 세션 작성)

맥미니 세션이 요청한 항목에 대한 답. 배경/원인/계획은 `sessions/dian-fabric.md`의 "2026-09-15 세션" 섹션.

## 골든셋 (scripts/golden-set.json)
- labels 100개, similar_ids ≥1인 쿼리 88개, 정답 항목 231개
- similar_ids에 null 항목 53개 포함 (12개 쿼리는 정답이 전부 null) → 실질 쿼리 76개(임베딩 없는 1개 제외 시 75), 실질 정답 177개
- 기존 `evaluate-golden-set.mjs`는 null을 정답 수에 넣어 Recall 과소 측정. `scripts/exp/prep.mjs`, `eval.mjs`는 null 제거 후 계산

## 기준 점수 (null 제거, 75쿼리/정답 177, 후보 = search_fabrics_dino RPC 상위 200)
| DINOv2/RGB | Recall@15 | P@5 | MRR |
|---|---|---|---|
| 100/0 | 38.8% | 9.9% | 0.319 |
| 80/20 | 52.8% | 11.5% | 0.306 |
| 60/40 (현재) | 50.2% | 13.6% | 0.335 |
| 0/100 | 50.2% | 14.9% | 0.417 |
RGB 비중과 무관하게 50.2% 상한 → 후보 200개 안에 정답이 없으면 색상이 못 살림. 임베딩 자체 개선 필요.

## env
- 변수명: GEMINI_API_KEY, OPENAI_API_KEY, REPLICATE_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
- Gemini는 `process.env.GEMINI_API_KEY`
- `vercel env pull`로 만든 파일은 값이 큰따옴표로 감싸짐 → 기존 scripts/*.mjs 파서가 못 벗김. scripts/exp/*.mjs는 따옴표 제거 처리함

## 노트북 시크릿
- `scripts/dinov2_embeddings.ipynb`(55행), `dinov2_crop_embeddings.ipynb`(57행) 2번째 코드 셀의 `SUPABASE_KEY` 변수에 평문 키 → placeholder로 교체 완료
- `.gitignore`에 `scripts/*.ipynb`가 있어 git에 커밋된 적 없음(로컬 전용). 히스토리 정리 불필요

## 실험 스크립트 실행 순서
1. `node scripts/exp/prep.mjs` (골든셋 + 무작위 → 2,400장, scripts/exp/data)
2. `node scripts/exp/embed.mjs q8` → `gray` → `crop` → (`fp32`)
3. `node scripts/exp/eval.mjs`
변형별 임베딩 수치는 아직 없음(다운로드 단계에서 맥미니로 이관).

## DB 현황 (anon 조회)
전체 16,608 / embedding_dino 16,062 / dino_crop 15,877 / lab_clusters 14,541 / notes rgb 13,355
데이터 오류 예: notes "그레이:70,아이보리:30|rgb:81,22,28"(색상명·RGB 불일치)

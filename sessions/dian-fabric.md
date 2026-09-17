# 원단찾기 프로젝트 — 작업 상태

> 마지막 업데이트: 2026-04-16 세션 2

## 오늘 완료 (2026-04-16)

### 1. 원단 상세 페이지 — 컬러웨이 갤러리
- API(`/api/fabrics/[id]`) 수정: 같은 원단명의 다른 컬러 variants 함께 반환 (최대 50개)
- 상세 페이지 하단에 컬러 썸네일 갤러리 추가 (64x64, 컬러코드 표시)
- 현재 컬러는 골드 테두리로 선택 표시
- **호버 프리뷰**: 썸네일에 마우스 올리면 메인 이미지가 해당 컬러로 변경, 떼면 원복
- 클릭 시 해당 컬러 상세 페이지로 이동

### 2. 뒤로가기 필터 유지
- "← 원단 목록" 버튼: `Link href="/fabrics"` → `router.back()` 변경
- 원단 목록 페이지: 필터/페이지 상태를 `sessionStorage`에 저장 및 복원
- 필터 걸고 → 상세 → 뒤로가기 시 이전 필터/페이지 상태 유지

### 3. 이미지 해상도순 정렬
- DB에 `image_width` 컬럼 추가 (ALTER TABLE fabrics ADD COLUMN image_width integer DEFAULT 0)
- `scripts/measure-image-quality.mjs`: 14,625개 이미지 해상도 측정 → image_width에 저장
  - 측정 성공: 14,417개, 실패: 207개
  - 최대 7,333px, 최소 601px
- GET API 정렬: `image_width DESC` (해상도 높은 순) → `name` (이름순)
- 색상 필터 시: 색상 점수 → 동점이면 해상도순

### 4. 원단명-컬러번호 검색 지원
- `MONCLER-24`, `MONCLER#24`, `MONCLER 24` 형식 지원
- 정규식으로 분리: `/^(.+?)[\s\-#]+(.+)$/`
- name `ilike '%MONCLER%'` AND color_code `ilike '%24%'` 부분 일치 검색
- 구분자 없으면 기존 통합 검색 유지

### 5. 성분 기반 다중 분류 (이전 세션)
- `scripts/apply-composition.mjs`: composition_note/co_percent/li_percent 기반
- 린넨(li>1%), 면(co>1%), 울(wool) → fabric_type에 쉼표 추가 (예: "패브릭,면,울")
- 3,681개 업데이트 완료

### 6. 검색 파이프라인 리팩토링 (이전 세션)
- 단계별 검색: Gemini 색상필터 → 색상명 정밀필터 → CLIP텍스처60%+RGB톤40% → GPT-4o 랭킹
- GPT-4o 랭킹: 텍스처+패턴만 비교 (색상은 이미 필터됨)
- Ctrl+V 붙여넣기 지원, sessionStorage 캐시

## 진행 중 / 대기
- [ ] **검색 배포 확인** — ALPINE-101 검색 Vercel 배포 대기 중
- [ ] THREAD, WILSON 원단 재추가 필요
- [ ] 62개 미분류 원단 별도 검토 (confirmed-1629.json에 없는 것)
- [ ] 스웨이드 수동 분류 (사용자)
- [ ] 아웃도어/친환경 수동 분류 (사용자)
- [ ] 커튼 분류 (구글시트 폭 데이터 기반, 2800mm 이상)

## DB 정리 완료 내역 (2026-04-15)
- 삭제: GROUP, HERMS 등 43개 원단명 568행
- 삭제: SOFT LEATHER 22행
- 삭제: V시리즈 중복 컬러번호 (XXXXX-XX 형식) 643행
- 삭제: Ricky/Unique 시리즈 충돌분 661행 + 변환불가 17행
- 이름 변경: Ricky/Unique → 개별 원단명 113행
- ⚠️ THREAD, WILSON 잘못 삭제됨 → 나중에 재추가 필요
- 현재 총 원단: 14,625개 (고유 원단명 1,503개)

## 분류 체계 (최종)
- **원단 종류 (type)**: 패브릭, 벨벳, 인조가죽, 시어 (린넨/면/울/커튼은 스펙 데이터에서, 쉼표 다중)
- **패턴 상세 (pattern)**: 무지, 부클, 하운드투스, 스트라이프, 체크, 헤링본, 추상, 기하학, 자연, 동물, 식물, 큰패턴, 다마스크 (다중 선택 가능)
- **사용처 (usage)**: 기본(소파/쿠션/침대헤드/스툴/벽패널) + 선택(커튼/아웃도어/친환경)
- **색상**: 아이보리~민트 15종, 비율 합산 100%

## 주요 스크립트
- `scripts/classify-gemini.mjs` — 전체 재분류 (최종 프롬프트, 기하학 포함)
- `scripts/apply-confirmed.mjs` — confirmed-1629.json → DB 통일 (8,529 업데이트)
- `scripts/apply-composition.mjs` — 성분 기반 린넨/면/울 다중 분류
- `scripts/measure-image-quality.mjs` — 이미지 해상도 측정 → image_width 컬럼

## 주요 파일
- `D:/DIAN FABRIC/confirmed-1629.json` — ✅ 사용자 컨펌 완료 분류 데이터
- `src/app/api/search/route.ts` — 검색 API (POST: AI 검색, GET: 목록/필터)
- `src/app/api/fabrics/[id]/route.ts` — 원단 상세 + 컬러 variants
- `src/app/fabric/[id]/page.tsx` — 상세 페이지 (호버 프리뷰, 컬러 갤러리)
- `src/app/fabrics/page.tsx` — 목록 페이지 (sessionStorage 필터 유지)
- `src/app/api/rank-fabrics/route.ts` — GPT-4o 텍스처 랭킹

## 프로젝트 정보
- 로컬: `D:/DIAN FABRIC/dian-fabric-app`
- GitHub: `Dianfabric/dian-fabric-app`
- Vercel: `dian-fabric-app.vercel.app`
- Supabase: `qkkobestkhkxlrjeuakt.supabase.co` (Pro)
- 원단 수: 14,625개 (고유 원단명 1,503개)
- 스택: Next.js 16 + Supabase + CLIP + Gemini + GPT-4o + Sharp

---

## 2026-09-15 세션 — 사진 유사검색 재검토 (데스크탑, 맥미니 세션으로 이어감)

### 조사 결론
- 검색 3세대 공존: `/search`(DINOv2 CLS + RGB + Gemini 하드필터 + GPT-4o 100px 그리드 랭킹, 메뉴 연결), `/search-clip`(v1), `/search-v3`(SQL soft scoring, 메뉴 미연결)
- **골든셋 기준 점수(null 정답 제거 후 75쿼리/정답 177, DB 이미지→DB 이미지)**: 현재 60/40 → Recall@15 50.2%, P@5 13.6%, MRR 0.335. DINOv2 단독 Recall@15 38.8%, 80/20이 52.8%로 최고. RGB 비중을 어떻게 바꿔도 50.2% 상한(후보 200개를 DINO RPC로 먼저 뽑기 때문). (null 포함 옛 계산은 35.7%/26.2%)
- 원인: ① DB 임베딩(Colab fp32) vs 쿼리(브라우저 q8) 파이프라인 불일치, DB 안에서도 혼재 ② 실제 폰사진으로 측정한 적 없음(도메인 격차 미측정) ③ Gemini 색상명/패턴이 하드 `ilike` 필터라 오분류 시 정답 탈락 ④ 색상 추출이 사진 전체 k-means(랜덤 초기값) ⑤ GPT-4o 재랭킹이 100px 썸네일 ⑥ CLS 토큰만 사용(질감은 패치 토큰)
- 데이터 오류 예: notes "그레이:70,아이보리:30|rgb:81,22,28" (색상명과 RGB 불일치) → 색상 데이터 점검 필요
- DB 현황: 전체 16,608 / embedding_dino 16,062 / dino_crop 15,877 / lab_clusters 14,541 / notes rgb 13,355

### 개선 계획 (우선순위)
1. 서버측 임베딩 통일 + DB 재생성, 하드필터 제거(보너스만), 중앙영역+화벨보정 LAB 색상, 합성 폰사진 테스트셋(원근/조명/블러 증강)
2. 질감/색 분리(흑백 질감 임베딩으로 디자인 매칭 → 컬러웨이는 색으로), CLS+패치평균, DB 타일 다중벡터, 재랭킹은 상위 20개 개별 이미지 1회 호출
3. 증강 기반 프로젝션 헤드 학습 (폰사진 ↔ 카탈로그 도메인 격차)

### 오프라인 실험 스크립트 (DB 안 건드림, anon 키로 가능)
- `scripts/exp/prep.mjs` → 골든셋+무작위 2,400개 이미지 로컬 다운로드 (scripts/exp/data, gitignore)
- `scripts/exp/embed.mjs <q8|fp32|gray|crop>` → 변형별 CLS/패치평균 임베딩 생성
- `scripts/exp/eval.mjs` → 변형/조합별 Recall@15, P@5, MRR 비교
- 순서: prep → embed q8 → embed gray → embed crop → (fp32) → eval. 결과 좋은 방식으로 DB 재생성 진행

### 환경 메모
- 데스크탑 `.env.local`은 `vercel env pull`로 갱신했으나 SUPABASE_SERVICE_KEY가 Vercel "Sensitive"라 빈 값. 맥미니 `.env.local`에 실제 키 있음
- Vercel pull 파일은 값이 따옴표로 감싸짐 → 기존 scripts/*.mjs의 naive env 파서가 깨짐(따옴표 제거 필요)
- `scripts/dinov2_embeddings.ipynb`, `dinov2_crop_embeddings.ipynb`(gitignore 대상, 로컬 전용)에 있던 옛 Supabase secret 키 평문은 제거함(SUPABASE_KEY 변수 → placeholder)
- 골든셋 데이터 오류: similar_ids에 null 항목 53개(12개 쿼리는 정답이 전부 null). 기존 evaluate-golden-set.mjs는 null을 정답 수에 포함해 Recall이 과소 측정됨 → scripts/exp/*.mjs는 null 제거 후 계산

### 2026-09-15 맥미니 세션 — 오프라인 실험 결과 및 v4 파이프라인 구현 (DB 쓰기 전)
- 실험 산출물: `scripts/exp/results-golden.md`, `scripts/exp/results-synth.md` (풀 2,398장, 골든셋 75쿼리, 합성 폰사진 300장)
- **핵심 발견**
  - Xenova/dinov2-base **q8/uint8 ONNX는 fp32와 코사인 0.36**(Node·브라우저 WASM 모두 확인). fp16 = 1.000, q4f16 = 0.95. 운영은 "브라우저 q8 쿼리 vs Colab fp32 DB"라 골든셋 기준 Recall@15 **1.8%**.
  - DB 자체 혼재: `generate-dino-local.mjs`(q8)로 만든 1,521행(image_width=0 전부)은 fp32 행과 0.3 유사도, DINO 없는 행 546. → 전체 재생성 필요.
  - `embedding_dino_crop` = 중앙 50% 크롭 fp32(재현 0.985). `embedding_dino` ≈ 전체 fp32(0.91, 일부 q8 혼재).
  - 골든셋 정답은 기존 DB 검색 후보에서 골라 DB 벡터에 편향(DB CLS 78.7% vs 독립 fp32 71.8%).
  - notes 색상: RGB 없음 2,750행, 색상명·RGB 명백 불일치 1~3%.
- **골든셋(카탈로그→카탈로그, R@15)**: fp32 전체 CLS 71.8 / +RGB40 74.8 / 흑백 65.7 / 타일 60.6 / 크롭 56.6. 패치평균·타일·크롭·흑백은 손해.
- **합성 폰사진(→카탈로그, R@1 / R@15)**: 크롭 패치평균 81.0 / 95.3 최고, 전체 CLS 63.7 / 91.7, 타일 75.7 / 94.3. 화이트밸런스 LAB는 해가 됨(raw LAB 51%, wb 34%).
- **채택: 전체 CLS 0.45 + 중앙크롭 패치평균 0.35 + raw LAB 0.20** → 골든 R@15 80.1% (P@5 25.6, MRR 0.637, R@1 52.0) / 합성 R@1 75.3, R@15 94.3.
- **구현 완료(코드만, DB 미변경)**: `src/lib/dino-server.ts`(fp16, DINO_DTYPE), `src/lib/color-lab.ts`, `api/embed`, `api/search-v4`(하드필터 없음, kNN 500 ∪ 500, 보너스 점수), `api/rank-v4`(상위 20개 개별이미지 Gemini 1회), `search/page.tsx`(NEXT_PUBLIC_SEARCH_V4=1 플래그), `supabase/v4-search-schema.sql`, `scripts/regen-embeddings-v4.ts`.
- **다음**: ① Supabase SQL 적용 ② `DINO_DTYPE=fp32 DINO_CACHE_DIR=scripts/exp/hf-cache node --experimental-strip-types scripts/regen-embeddings-v4.ts` (맥미니, 약 2시간) ③ 맥미니 .env.local에 GEMINI_API_KEY 추가 ④ 플래그 켜고 실제 폰사진 20~30장 검증. Vercel 배포 시 fp16(174MB) 콜드스타트 확인, 안 되면 q4f16(50MB)로 DB까지 통일.
- **2026-09-15 저녁 장애 기록**: v4 재생성 중 Supabase Postgres가 2회 응답 불능(18:00~21:17, 21:40~22:00 전후). 원인은 `emb_v4`/`emb_v4_crop`의 HNSW 인덱스 — 행 UPDATE마다 그래프 삽입(무작위 IO)이 일어나 인스턴스의 IO/메모리를 소진. 운영 API도 500. 조치: 쓰기 전면 중단 → `supabase/v4-drop-hnsw-and-rpc-v2.sql`(HNSW 2개 삭제, 재생성 안 함 + RPC v2) 적용 후 재개. 16.7k행은 인덱스 없이 정확 탐색 50~150ms로 충분. 재생성 12,323행 완료 시점에서 중단, 남은 4,360행은 인덱스 제거 후 `--only-missing`(쓰기 동시성 2)로 재개. 별건: fabric.diantex.kr DNS 레코드 NXDOMAIN(hostcocoa에서 CNAME 소실 추정).

### 2026-09-16 v4 프로덕션 배포 (deploy-main.sh)
- main @ 080f3b6, 프로덕션 스모크 rc=1 (scripts/exp/data/prod-smoke.md). 최종 보고 scripts/exp/final-report.md
- **2026-09-17 09:58 v4 프로덕션 배포 성공** (main @ f4ed0b1). 첫 배포는 onnxruntime 리눅스 .so 누락으로 /api/embed 500 → `outputFileTracingIncludes`로 포함, 함수 390MB 초과 → darwin/win32/arm64 바이너리·web wasm 제외 + Vercel env `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`. 프로덕션 스모크: 임베딩 콜드 21.6s/웜 1.9s, 검색 웜 1.2s, Gemini 재랭킹 10s, 합성 쿼리 원본 1위(95점). 최종 보고 `scripts/exp/final-report.md`.
- **2026-09-17 색상 우선 정책 배포** (main @ 5bd75fa): search-v4 색상 비중 40%(CLS35/크롭25/LAB40), 게이트 코드 있음(기본 OFF). 실제 DB 측정: 골든 R@15 57.1 / R@1 40.0 / MRR 0.513, 합성 R@15 80.3. `scripts/exp/results-db-colour.md`. 되돌리기 `SEARCH_V4_COLOR_MODE=normal`.
- **2026-09-17 실사용 피드백 반영** (main @ 01db01f): ① CIE94 색차(kL=4)+유채/무채 규칙, 색상 45%, 점진 감점 → 골든 R@15 64.1/R@1 44/MRR 0.557 ② 패턴 힌트 보너스/감점(+0.05/−0.03/무지 −0.08), 재랭킹 프롬프트 색상→패턴→질감 ③ 다중 배율 쿼리(2×2/3×3 모자이크, 배율별 kNN max) → 폰 근접샷 FIZE-11 100위 밖 → 재랭킹 후 2위 ④ 쿼리 사진 자동 수집(SEARCH_QUERY_CAPTURE, 버킷 search-queries, scripts/exp/pull-queries.mjs). 검색 시간 3~4초로 증가.

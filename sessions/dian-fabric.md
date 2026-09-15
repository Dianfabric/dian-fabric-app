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

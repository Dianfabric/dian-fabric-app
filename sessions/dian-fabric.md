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

# 원단찾기 프로젝트 — 작업 상태

> 마지막 업데이트: 2026-04-15

## 현재 진행 중
- [ ] **Gemini 분류 컨펌 작업** — HTML에서 1,629개 고유 원단 분류 확인 중
  - HTML: `D:/DIAN FABRIC/01_TEST/gemini-sample-1000.html` (드롭다운 편집+컨펌 기능)
  - JSON: `D:/DIAN FABRIC/01_TEST/gemini-sample-1000.json`
  - 모델: **Gemini 3 Flash** (gemini-3-flash-preview)
  - 결과: 1,629/1,629 성공 (에러 0)
  - 컨펌 완료 후 → 전체 JSON 내보내기 → DB 반영
- [ ] **컨펌 후 다음 단계** — 나머지 ~14,907개 (같은 원단, 다른 컬러)
  - type + pattern + usage → 고유 원단에서 복사
  - colors만 별도 분류 (간단 프롬프트 or RGB 추출)
  - 비용/시간 절반 이하로 절약

## 분류 체계 (최종)
- **원단 종류 (type)**: 패브릭, 벨벳, 인조가죽, 시어 (린넨/면/울/커튼은 스펙 데이터에서)
- **패턴 상세 (pattern)**: 무지, 부클, 하운드투스, 스트라이프, 체크, 헤링본, 추상, 자연, 동물, 식물, 큰패턴, 다마스크 (다중 선택 가능)
- **사용처 (usage)**: 소파, 쿠션, 커튼, 침대헤드, 스툴, 벽패널, 아웃도어, 친환경
- **색상**: 아이보리~민트 15종, 비율 합산 100%

## 차단 이슈
- [ ] Vercel Pro 미결 — next/image 402 에러로 이미지 일부 깨짐
  - 임시: `next.config`에 `images: { unoptimized: true }` 추가 가능
  - 정식: Vercel Pro 업그레이드 ($20/월)
- [x] Gemini 2.5 Flash RPD 초과 (일일 10K) → **Gemini 3 Flash로 전환하여 해결**
- [x] Supabase 할당량 초과 → **Pro 업그레이드로 해결**

## 주요 스크립트
- `scripts/classify-gemini.mjs` — 전체 재분류 (Gemini 2.5 Flash, 진행파일 지원)
- `scripts/classify-sample-1000.mjs` — 고유 원단 샘플 분류 (Gemini 3 Flash, DB 미수정)
- `scripts/gen-html-editable.mjs` — JSON → 편집 가능 HTML 생성
- `scripts/compare-models.mjs` — GPT-4o vs Gemini 비교

## 최근 완료
- [x] Gemini 3 Flash 고유 원단 1,629개 분류 완료 (에러 0, 48분 소요)
- [x] 편집+컨펌 가능 HTML 생성 (드롭다운, 체크박스, 필터, JSON 내보내기)
- [x] Supabase Pro 업그레이드 완료 (2026-04-15)
- [x] 이미지 깨짐 원인 분석 — Vercel 이미지 최적화 할당량 초과
- [x] Colab 업스케일 — 미실행 확인 (이미지 손상 없음)
- [x] 499장 모델 비교 (4/14) — Gemini=색상, GPT-4o=패턴 강점
- [x] GitHub 코드 동기화 — 최종 프롬프트 + 새 카테고리 반영

## 프로젝트 정보
- 로컬: `D:/DIAN FABRIC/dian-fabric-app`
- GitHub: `Dianfabric/dian-fabric-app`
- Vercel: `dian-fabric-app.vercel.app`
- Supabase: `qkkobestkhkxlrjeuakt.supabase.co` (Pro)
- 원단 수: 16,536개 (고유 원단명 1,629개)
- 스택: Next.js 16 + Supabase + CLIP + Gemini + Sharp

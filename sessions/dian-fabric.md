# 원단찾기 프로젝트 — 작업 상태

> 마지막 업데이트: 2026-04-15 17:30

## 현재 진행 중
- [ ] **DB 통일 작업 진행 중** — confirmed-1629.json 기준으로 전체 원단 type/pattern/usage 통일
  - 소스: `D:/DIAN FABRIC/confirmed-1629.json` (사용자 다운로드 파일, 1,629개 전체 성공)
  - ⚠️ `D:/DIAN FABRIC/01_TEST/gemini-sample-1000.json`은 Gemini 2.5 Flash 에러 작업이 덮어씀 — 사용 금지!
  - 진행: ~3,000/14,625 (에러 ~1,640개 → Supabase rate limit, 재처리 필요)
  - 기준없음: ~4개 (이름 변경된 원단, 거의 없음)
- [ ] **통일 완료 후 할 일:**
  1. 에러분 재처리 (rate limit 간격 두고 재시도)
  2. 기준없음 원단 확인 → 리스트 제공 (Gemini 추가 분류 안 함)
  3. 원단 상세 페이지에 **전 컬러 갤러리** 추가 (참고: qbh-fab.com 스타일)

## DB 정리 완료 내역 (2026-04-15)
- 삭제: GROUP, HERMS 등 43개 원단명 568행
- 삭제: SOFT LEATHER 22행
- 삭제: V시리즈 중복 컬러번호 (XXXXX-XX 형식) 643행
- 삭제: Ricky/Unique 시리즈 충돌분 661행 + 변환불가 17행
- 이름 변경: Ricky/Unique → 개별 원단명 113행 (예: Ricky Blue/LD2273P-15 → LD2273P/15)
- ⚠️ THREAD, WILSON 잘못 삭제됨 → 나중에 재추가 필요
- 현재 총 원단: 14,625개 (고유 원단명 1,503개)

## 분류 체계 (최종)
- **원단 종류 (type)**: 패브릭, 벨벳, 인조가죽, 시어 (린넨/면/울/커튼은 스펙 데이터에서)
- **패턴 상세 (pattern)**: 무지, 부클, 하운드투스, 스트라이프, 체크, 헤링본, 추상, 기하학, 자연, 동물, 식물, 큰패턴, 다마스크 (다중 선택 가능)
- **사용처 (usage)**: 기본(소파/쿠션/침대헤드/스툴/벽패널) + 선택(커튼/아웃도어/친환경)
- **색상**: 아이보리~민트 15종, 비율 합산 100% (이전 분류 유지, 새로 안 함)

## 차단 이슈
- [ ] Vercel Pro 미결 — next/image 402 에러
- [x] Gemini 2.5 Flash RPD 초과 → Gemini 3 Flash 전환
- [x] Supabase 할당량 초과 → Pro 업그레이드

## 주요 스크립트
- `scripts/classify-gemini.mjs` — 전체 재분류 (최종 프롬프트, 기하학 포함)
- `scripts/classify-sample-1000.mjs` — 고유 원단 샘플 분류 (Gemini 3 Flash)
- `scripts/gen-html-editable.mjs` — JSON → 편집+컨펌 HTML (localStorage 자동저장, 페이지네이션)
- `scripts/classify-colors-only.mjs` — 색상만 분류 (미사용)

## 주요 파일
- `D:/DIAN FABRIC/confirmed-1629.json` — ✅ 사용자 컨펌 완료 분류 데이터 (진짜 파일)
- `D:/DIAN FABRIC/01_TEST/gemini-sample-1000.json` — ❌ 덮어써짐, 사용 금지
- `D:/DIAN FABRIC/01_TEST/gemini-sample-1000.html` — 컨펌용 HTML

## 최근 완료
- [x] confirmed-1629.json 기준 DB 통일 시작 (진행 중)
- [x] 패턴에 기하학 추가 + 홈페이지/프롬프트 반영 + 푸시
- [x] Gemini 3 Flash 1,629개 분류 완료 + 전체 컨펌
- [x] DB 정리 (삭제/이름변경/중복제거)
- [x] Supabase Pro 업그레이드
- [x] 컨펌 HTML (드롭다운+체크박스+페이지네이션+localStorage)

## 프로젝트 정보
- 로컬: `D:/DIAN FABRIC/dian-fabric-app`
- GitHub: `Dianfabric/dian-fabric-app`
- Vercel: `dian-fabric-app.vercel.app`
- Supabase: `qkkobestkhkxlrjeuakt.supabase.co` (Pro)
- 원단 수: 14,625개 (고유 원단명 1,503개)
- 스택: Next.js 16 + Supabase + CLIP + Gemini + Sharp

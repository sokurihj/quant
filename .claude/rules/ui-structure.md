# index.html JS 구조 주의사항

- `render()` 함수 내 state 변수명: `state` (destructured: `{ T, avg, shares, rem, div }`)
- `handleBuy/handleSell` 함수 내 state 변수명: `s = ls(\`st_\${sym}\`)`
- 두 컨텍스트에서 변수명이 다르므로 혼용 금지
- 쿼터매도 시 `s.rem` 미변경은 의도된 설계 (수익은 전략 외부로 빠짐)
- 쿼터매도 수량은 `qtyFloor(shares * 0.25, sym)` — 심볼별 처리 (주식: 온주, BTC: 소수점 6자리)

## 매수 입력 방식
- 매수 금액이 아닌 **수량(qty) + 매수가**로 입력받음
- `amount = qty * price` 로 내부 계산
- 권장 수량 = `qtyFloor(nextBuyAmt / price, sym)` — 매수가 입력 시 실시간 표시; BTC는 소수점 6자리
- 매수가 입력 시 권장 수량 자동 계산하여 수량 입력란에 채워짐 (BTC 소수점 입력 불편 해소)
- 권장 수량 초과 입력 시 차단, 이하는 허용 (부분 체결 대응)

## BTC 탭 전용 UI 규칙
- T+0.5(절반 체결) 버튼 숨김 — 항상 T+1 고정
- 매수 수량 단위: `BTC`, placeholder `예: 0.001163`
- 주식 탭 placeholder: `예: 3`
- 보유 수량 표시: `toFixed(conf(sym).decimals || 4)` + `conf(sym).unit`

## 사이클 종료 흐름 (Next.js, handleSell('all'))
- 매매일지 수익 계산: `hist`에서 `type === 'quarter'`인 항목의 amount 합산 → `quarterProceeds`
- `nextRem = cur.rem + cur.shares * price` (쿼터매도 수익 제외, 다음 사이클 초기 잔금)
- `journalEndRem = nextRem + quarterProceeds` (저널용 종료 자본 — 쿼터매도 포함)
- `startRem = cur.cycleStartRem` (첫 매수 시 기록된 잔금)
- `journalProfit = journalEndRem - startRem`
- 재설정 모달 기본값: `resetCapital = journalEndRem.toFixed(2)`
- `handleSell('all')` → 현재 hist + 최종 매도 entry를 `JournalEntry.trades`에 포함해 매매일지 저장 → state 리셋 → 재설정 모달 표시
- 모달(`#reset-overlay`)에서 총 자본·분할수 입력 → `handleResetConfirm()` 호출
- `handleResetConfirm()`: `defState(capital, division)` + cycle 번호 이어받기 + hist 초기화
- `ss('hist_${sym}', hist)` 는 type='quarter'일 때만 실행 — type='all'은 return으로 건너뜀

## localStorage 키
| 키 | 용도 |
|----|------|
| `st_${sym}` | state 객체 |
| `hist_${sym}` | 거래 내역 배열 |
| `undo_${sym}` | 되돌리기 스택 |
| `journal_${sym}` | 매매일지 배열 (사이클별 수익 기록) |
| `lqp_${sym}` | 마지막 쿼터매도 수익 임시 보관 (Supabase 동기화 없음; 재투입 시 삭제) |

## state 주요 필드
| 필드 | 설명 |
|------|------|
| `total` | 총 자본 (표시 전용 — 계산에 미사용; 사이클 완료 시 `endRem`으로 갱신) |
| `cycle` | 현재 사이클 번호 (전량매도 시 +1) |
| `cycleStartRem` | 사이클 시작 시 잔금 |
| `cycleStartDate` | 사이클 첫 매수일 (첫 매수 시 자동 기록) |

## UI 탭 구조
`① 매수 기록` / `② 매도 기록` / `③ 매매일지` / `④ 설정`
- `switchTab(name)`: `['buy','sell','journal','setting']` 배열 기준으로 탭 전환
- journal 탭 전환 시 `renderJournal()` 자동 호출

## 리버스모드 매수 탭 (Next.js)
- 별지점(5일 평균) 입력 → 권장 주문 수량 실시간 표시: `qtyFloor(rem/4 / 별지점, sym)`
- 매수금액 입력란 없음 — 항상 잔금/4 자동
- 실제 체결가만 입력 → `qtyFloor(rem/4 / 체결가, sym)` 수량으로 기록
- `revByeol` state는 ① 매수 탭과 ② 매도 탭이 공유 (한 번 입력하면 양쪽 반영)
- `TargetCards`에 `revByeol` prop 전달 → 상단 리버스 별지점 카드에 실시간 표시
- 별지점 입력란 옆 "5일평균" 버튼 → `/api/toss/candles?symbol=` 호출해 자동 채움 (BTC 제외, 주식만)

## 토스증권 API 연동 (Next.js)
- 매수가 입력란 옆 "현재가" 버튼 → `/api/toss/price?symbol=` 호출해 자동 채움 (BTC 제외, 주식만)
- API route가 서버에서 `TOSS_CLIENT_ID`/`TOSS_CLIENT_SECRET`으로 토큰을 발급해 클라이언트에 Secret 미노출
- BTC는 토스증권 미지원 종목이므로 두 버튼 모두 표시하지 않음
- HYNIX2X 등 국내 종목은 `toss.ts`의 `SYMBOL_MAP`으로 토스 종목코드로 자동 변환 (HYNIX2X→0195S0)

## 계좌 동기화 (Next.js, 설정 탭)
- 설정 탭 맨 아래 "계좌 동기화" 버튼 — BTC 제외, 주식·ETN 전용
- 클릭 시 `/api/toss/holdings?symbol=` 호출 → 토스 계좌의 보유수량·평단가를 `state.shares`, `state.avg`에 덮어씀
- 동기화 전 `saveSnapshot(sym)`으로 undo 스택 저장 → 되돌리기 가능
- 보유량 0이면 state 업데이트 없이 'empty' 메시지 표시 (0으로 덮어쓰기 방지)
- `syncLoading` / `syncStatus('idle'|'ok'|'error'|'empty')` state로 UI 피드백

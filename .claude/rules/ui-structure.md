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

## 사이클 종료 흐름
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

## state 주요 필드
| 필드 | 설명 |
|------|------|
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

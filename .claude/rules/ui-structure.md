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
- `netProfit = journalProfit - totalFees(cycleHist, sym)` — 매매일지에 저장되는 최종 `profit`/`profitPct` (수수료 차감, 표시 전용 — `rem`/`avg` 등 실제 상태 계산에는 미반영)
- `lastQuarterProceeds`/`lqp_${sym}`도 함께 0으로 초기화 — 다음 사이클 파킹 목표에 중복 가산되는 것 방지
- `handleSell('all')` → 현재 hist + 최종 매도 entry를 `JournalEntry.trades`에 포함해 매매일지 저장 → state 리셋(`rem: nextRem`, cycle+1, T=0) → "사이클 완료" alert
- **Next.js에는 재설정 모달 없음** — 잔여자본이 `nextRem`으로 자동 갱신되고 앱 계속 사용 가능; 쿼터매도 수익·파킹 이자 반영은 설정 탭 "잔여자본 직접 수정"으로 수동 보정 (가이드 탭 4번)
- (index.html 전용) 재설정 모달 `#reset-overlay` 표시, 기본값 `resetCapital = journalEndRem.toFixed(2)` → `handleResetConfirm()`: `defState(capital, division)` + cycle 번호 이어받기 + hist 초기화; `ss('hist_${sym}', hist)` 는 type='quarter'일 때만 실행 — type='all'은 return으로 건너뜀

## localStorage 키
| 키 | 용도 |
|----|------|
| `st_${sym}` | state 객체 |
| `hist_${sym}` | 거래 내역 배열 |
| `undo_${sym}` | 되돌리기 스택 |
| `journal_${sym}` | 매매일지 배열 (사이클별 수익 기록) |
| `lqp_${sym}` | 마지막 쿼터매도 수익 임시 보관 — rem 재투입은 하지 않고 파킹 목표에만 자동 합산 (Supabase 동기화 없음; 전량매도로 사이클 종료 시 삭제) |
| `park_${sym}` | 파킹 시 현금으로 남길 회차 수 (기본 4; Supabase 동기화 없음) |

## state 주요 필드
| 필드 | 설명 |
|------|------|
| `total` | 총 자본 (표시 전용 — 계산에 미사용; 사이클 완료 시 `endRem`으로 갱신) |
| `cycle` | 현재 사이클 번호 (전량매도 시 +1) |
| `cycleStartRem` | 사이클 시작 시 잔금 |
| `cycleStartDate` | 사이클 첫 매수일 (첫 매수 시 자동 기록) |

## UI 탭 구조
`① 매수 기록` / `② 매도 기록` / `③ 매매일지` / `④ 설정` (+ Next.js는 `⑤ 가이드`)
- index.html `switchTab(name)`: `['buy','sell','journal','setting']` 배열 기준으로 탭 전환
- journal 탭 전환 시 `renderJournal()` 자동 호출
- Next.js `TabName`: `'buy'|'sell'|'journal'|'setting'|'guide'` — 가이드 탭은 파킹 운용 순서(최초 파킹→평소 루틴→쿼터매도→사이클 종료→월초 정산→주의사항)를 정적 콘텐츠로 표시, 모든 심볼에서 노출 (USD는 SGOV, KRW는 TIGER KOFR 예시로 언급)

## 리버스모드 매수 탭 (Next.js)
- 별지점(5일 평균) 입력 → 권장 주문 수량 실시간 표시: `qtyFloor(rem/4 / 별지점, sym)`
- 매수금액 입력란 없음 — 항상 잔금/4 자동
- 실제 체결가만 입력 → `qtyFloor(rem/4 / 체결가, sym)` 수량으로 기록
- `revByeol` state는 ① 매수 탭과 ② 매도 탭이 공유 (한 번 입력하면 양쪽 반영)
- `TargetCards`에 `revByeol` prop 전달 → 상단 리버스 별지점 카드에 실시간 표시
- 별지점 입력란 옆 "5일평균" 버튼 → `/api/toss/candles?symbol=` 호출해 자동 채움 (BTC 제외, 주식만)

## LOC 가이드 단계별 표시 (Next.js, LocGuide)
- 전반전(`!isSecondHalf`) + BTC 제외 조건에서 **별지점·평단가 행 아래에 단계3·단계4 행 추가 표시**
- `gap = (bpr - s.avg) / 2` — 별지점-평단가 간격의 절반
- `step3Pt = avgPt - gap` (평단 −bp/2%) / `step4Pt = avgPt - 2×gap` (평단 −bp%)
- `opacity-55`로 흐리게 표시 — 전략 필수 주문(별지점/평단가)과 시각적으로 구분
- 오른쪽에 금액 대신 "추가 주문" 레이블 — 1회 매수금액에 포함되지 않는 선택적 주문임을 표시
- 후반전·BTC에서는 표시 안 함

## 토스증권 API 연동 (Next.js)
- 매수가 입력란 옆 "현재가" 버튼 → `/api/toss/price?symbol=` 호출해 자동 채움 (BTC 제외, 주식만)
- API route가 서버에서 `TOSS_CLIENT_ID`/`TOSS_CLIENT_SECRET`으로 토큰을 발급해 클라이언트에 Secret 미노출
- BTC는 토스증권 미지원 종목이므로 두 버튼 모두 표시하지 않음
- HYNIX2X 등 국내 종목은 `toss.ts`의 `SYMBOL_MAP`으로 토스 종목코드로 자동 변환 (HYNIX2X→0195S0)

## 토스증권 주문 전송 (Next.js, 매수·매도 탭)
- BTC 제외, `hasPos || isFirst` 조건일 때 주문 버튼 표시. **매수 탭 섹션**은 추가로 `openOrders !== null && openOrders.length > 0`일 때도 표시 — 포지션 없이 복귀해도 캐시된 주문 유지
  - `isFirst`: `shares === 0 && avg === 0 && buyPriceNum > 0` — 포지션 없지만 현재가 입력된 첫 진입 상태
  - `isFirst`일 때 섹션 제목에 "— 첫 진입 (현재가 기준)" 표시
- **매수 탭**
  - USD 심볼(TQQQ/SOXL/RAM): LOC 섹션(별지점/현재가 LOC, 평단가 LOC*) + 지정가 섹션(별지점/현재가 지정가, 평단가 지정가*)
  - KRW 심볼(HYNIX2X): 지정가 섹션만 (LOC 미지원)
  - *전반전(`T < div/2`)이고 `hasPos`인 경우에만 평단가 버튼 표시 (`isFirst`이면 평단가 버튼 없음)
  - `isFirst`일 때: 버튼 라벨 "현재가 LOC"/"현재가 지정가", 가격=`buyPriceNum`, 배정금액=`nb` 전액
- **매도 탭**: 쿼터매도 주문 (별지점 지정가, 보유량 ¼) + 지정가매도 주문 (목표가, 보유량 − 쿼터수량)
  - 지정가매도 수량 = `shares - qtyFloor(shares * 0.25, sym)` (단순 ¾ 곱셈 시 1주 누락 방지)
- 버튼 클릭 → `orderDraft` state에 주문 정보 저장 → 확인 모달 표시 → "주문 전송" 클릭 → `POST /api/toss/order`
- `orderDraft` 구조: `{ label, side, orderType:'LIMIT', timeInForce?:'CLS', price, quantity, clientOrderId, maxQty, allocAmt? }`
  - `clientOrderId` 형식: 주문 모달 생성 시 `${sym}-${side}-${type}-${Date.now()}` 기반 고유값 사용 — 토스 멱등성 키 재사용으로 취소 후 재주문이 막히는 문제 방지
  - `maxQty`: 전략 공식 기준 최대 수량 — 매수: `qtyFloor(allocAmt / price, sym)`, 매도: 쿼터=`qtyFloor(shares×0.25, sym)`, 지정가=`shares−quarterQty`
  - `allocAmt`: 매수 주문만 보유 — 이번 회차 배정금액 (별지점=`nb` or `nb/2`, 평단가=`nb/2`)
- 모달 수량 필드는 editable input — 자동 계산값이 기본 채워지고 직접 수정 가능
  - 초기 수량 결정 우선순위: `recQty > maxQty > 1` (recQty와 maxQty 모두 0이면 1주로 열림)
  - 가격이 0 이하일 때만 alert로 차단 (수량 0은 차단하지 않음)
- 모달 한도 표시 및 경고 로직:
  - **LOC 매수** (`timeInForce:'CLS'`): `배정금액 {allocAmt} (LOC: 종가 체결)` 표시, 초과 경고 없음 — 실제 체결가(종가)가 limit price보다 낮으므로 지정가 기준 비교는 부적절
  - **지정가 매수**: `qty × price > allocAmt`이면 "배정금액 초과 — {qty}주 × {price} = {cost}" 경고
  - **매도**: `maxQty > 0`이면 "최대 {maxQty}{unit}" 표시, `qty > maxQty`이면 "전략 한도 초과" 경고
- KRW 일반 주문가 포맷: `Math.floor(price / conf(sym).tick) * conf(sym).tick` (HYNIX2X tick=5 → ₩5 단위 내림)
- KRW 목표가 포맷: `targetPrice()` = `Math.floor(price / 10) * 10` — TargetCards·LocGuide·매도 탭 목표가·빈값 자동 매도 기록·매도 주문 가격에 적용
- `orderStatus('idle'|'ok'|'error')` / `orderErrMsg` state로 모달 내 피드백
- LOC 주문: `timeInForce:'CLS'` — 미국 장 마감 지정가 (USD 심볼 전용, KRX 미지원)
- 토스 API 주문 에러 패턴: `{ error: { code, message } }` 형태로 중첩됨
- 주문 체결은 자동 감지 없음 — 체결 확인 후 매수/매도 탭에서 수동 기록 필요 (3단계 폴링 미구현)

## 미체결 주문 관리 (Next.js, 매수·매도 탭)
- 매수·매도 탭의 "토스증권 주문 전송" 섹션 안에 **미체결 주문 박스** 표시 (BTC 제외)
- `openOrders`: `null`(미조회) | 배열(조회 완료) — `page.tsx`의 `openOrdersCache`(`Partial<Record<Symbol, OpenOrder[] | null>>`)에서 심볼별로 관리; 심볼 전환 후 복귀해도 캐시 유지. `QuantApp`에 prop으로 전달(`openOrders`, `setOpenOrders`)
- `ordersLoading` / `cancellingId` state로 UI 피드백
- "확인" 버튼 → `GET /api/toss/order?symbol=` → `openOrders` state 업데이트
  - Toss API 응답 구조: `{ result: { orders: [...] } }` (items 아님)
  - 미체결 상태는 `status: 'PENDING'` (조회 파라미터는 `status=OPEN`)
- 주문 행: `LOC매수 / 지정매수 / 지정매도 | 가격 × 수량` + "취소" 버튼
- "취소" 버튼 → `DELETE /api/toss/order/:orderId` (프록시가 내부적으로 `POST /api/v1/orders/:orderId/cancel` 호출) → 성공 시 해당 항목 목록에서 제거

## 파킹 계산 (Next.js, 설정 탭)
- 표시 조건: `sym !== 'BTC' && parkEtf && !isReverse` — BTC 제외 전 심볼(USD/KRW) 일반모드 대상
- 통화별 파킹 ETF는 `PARK_ETF` 상수(`quant-app.tsx`)로 결정: `USD → SGOV`, `KRW → TIGER KOFR금리액티브(449170)`
- 대기자금 파킹 규칙: 앞으로 N회차분 매수금액만 현금으로 남기고 나머지를 파킹 ETF에 파킹
  - `parkBuffer = min(N, div − T) × nextAmt(rem, div, T)` / `parkAmt = max(0, rem + lastQuarterProceeds − parkBuffer)`
  - `lastQuarterProceeds`(미재투입 쿼터매도 수익)를 목표액에 자동 합산 — 값이 0보다 크면 "+ 쿼터매도 수익 (미재투입)" 행 표시
- 회차 수 N은 입력란으로 조정 (기본 4, min 1) — `storage.ts`의 `getParkN/setParkN`으로 `park_${sym}` 키에 저장 (lqp 패턴, Supabase 미동기화)
- "{ETF명} 조회" 버튼 → `/api/toss/price?symbol={code}` + `/api/toss/holdings?symbol={code}` 병렬 호출 (SGOV는 `SGOV`, KRW는 `449170`)
  - 두 심볼 모두 `SYMBOL_MAP` 등록 없이 통과 (`toTossSymbol`이 미등록 티커를 그대로 전달)
  - **비교 기준은 계좌 전체 합산**: 파킹 ETF 보유는 통화별로 계좌에 하나뿐이므로, `PARK_SYMBOLS[cur]`(USD: TQQQ/SOXL/RAM, KRW: HYNIX2X)에서 현재 심볼을 제외한 같은 통화 심볼들의 권장 파킹액(`getState`+`getParkN`+`getLastQP`로 계산, 일반모드만)을 합친 `totalParkTarget`과 보유 평가액을 비교
  - 다른 심볼 몫이 있으면 "계좌 전체 목표 (+RAM $…)" 행 추가 표시 (KRW는 HYNIX2X 단독이라 이 행 미표시)
  - 갭이 1주 가격 초과 시 "약 X주 매수/매도 권장" 표시, 이내면 "적정 수준"
- `parkN`/`parkInfo`/`parkLoading`/`parkStatus('idle'|'error')` state — state 변경 없는 표시 전용 기능 (undo 불필요)

## 계좌 동기화 (Next.js, 설정 탭)
- 설정 탭 맨 아래 "계좌 동기화" 버튼 — BTC 제외, 주식·ETN 전용
- 클릭 시 `/api/toss/holdings?symbol=` 호출 → 토스 계좌의 보유수량·평단가를 `state.shares`, `state.avg`에 덮어씀
- 동기화 전 `saveSnapshot(sym)`으로 undo 스택 저장 → 되돌리기 가능
- 보유량 0이면 state 업데이트 없이 'empty' 메시지 표시 (0으로 덮어쓰기 방지)
- `syncLoading` / `syncStatus('idle'|'ok'|'error'|'empty')` state로 UI 피드백

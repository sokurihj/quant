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
- 매매일지 수익 계산: `hist`에서 `type === 'quarter'`이고 `!reinv`인 항목의 amount 합산 → `quarterProceeds` (재투입된 쿼터 수익은 이미 rem에 포함되어 있어 제외)
- `nextRem = cur.rem + cur.shares * price` (쿼터매도 수익 제외, 다음 사이클 초기 잔금)
- `journalEndRem = nextRem + quarterProceeds` (저널용 종료 자본 — 쿼터매도 포함)
- `startRem = cur.cycleStartRem` (첫 매수 시 기록된 잔금)
- `journalProfit = journalEndRem - startRem`
- `netProfit = journalProfit - totalFees(cycleHist, sym)` — 매매일지에 저장되는 최종 `profit`/`profitPct` (수수료 차감, 표시 전용 — `rem`/`avg` 등 실제 상태 계산에는 미반영)
- `lastQuarterProceeds`/`lqp_${sym}`도 함께 0으로 초기화 — 다음 사이클 파킹 목표에 중복 가산되는 것 방지
- `handleSell('all')` → 현재 hist + 최종 매도 entry를 `JournalEntry.trades`에 포함해 매매일지 저장 → state 리셋(`rem: nextRem`, cycle+1, T=0) → "사이클 완료" alert
- **Next.js에는 재설정 모달 없음** — 잔여자본이 `nextRem`으로 자동 갱신되고 앱 계속 사용 가능; 쿼터매도 수익·파킹 이자 반영은 설정 탭 "잔여자본 직접 수정"으로 수동 보정 (가이드 탭 4번)
  - "잔여자본 직접 수정"은 **0을 허용**한다 (전액 매수로 잔금이 없는 경우가 실제로 있음). 음수·빈값만 거부하며, 수정 시 `cycleStartRem`도 `delta`만큼 함께 조정되어 사이클 수익 계산이 유지됨
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
| `pf_assets` | 포트폴리오 자산 목록 (`Asset[]`) — 심볼과 무관한 전역 값; **Supabase 동기화됨** |
| `pf_targets` | 분류별 목표 비중 (`{주식, 코인, 현금}`, 기본 65/20/15); **Supabase 동기화됨** |
| `reinv_${sym}` | 쿼터매도 수익 재투입 여부 ('1'이면 켜짐; Supabase 동기화 없음) — 켜진 상태의 쿼터매도는 `rem += proceeds` + hist 항목에 `reinv: true` 표시, lqp 미기록; 사이클 종료 수익 계산은 `!h.reinv` 항목만 quarterProceeds에 합산. 설정 탭 토글로 켜는 순간 기존 lqp를 rem에 합산할지 confirm |

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
- 심볼 탭에 `'ALL'`(전체) 추가 — 선택 시 `QuantApp` 대신 `Portfolio`를 렌더하므로 아래 `TabName` 구조와 무관
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
  - 초기 수량 결정: `capRecQty(maxQty)` — `recQty`와 `maxQty` 둘 다 양수면 `Math.min(recQty, maxQty)`, 하나만 있으면 그 값, 둘 다 0이면 1주 (recQty는 매수가=현재가 기준이라 주문가 기준 안전 수량을 넘을 수 있어 캡 필요)
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

## LOC 사다리 (Next.js, 매수 탭 — 과매수 방지)
- 원리: LOC는 종가 체결이라 배정금액(`B`) 전액을 한 번에 걸면 종가가 애매한 지점에서 1주어치 과매수될 수 있음.
  이를 `calc.ts`의 `locLadder(B, byeolPt, sym, rows)`으로 N등분해 1주씩 걸어두면, N번째 주문(가격 `B/N`)이 체결됐다는 것 자체가 `종가 ≤ B/N`이라는 뜻이라 `N주 × 종가 ≤ B` 항상 보장됨
  - `k = qtyFloor(B/byeolPt, sym)` (기존 "구매가능" 수량과 동일 공식), `baseQty = k` (기준가 그대로 전량, 감산 없음)
  - `rungs`: `baseQty > 0`이면 `n = k+1, k+2, …, k+rows`부터, `baseQty = 0`(k=0)이면 `n = 1, 2, …, rows`부터 — 각 행 가격 `B/n`, 수량 1주 (사다리 시작가가 항상 기준가보다 낮아 기준가 도달 전 선체결되는 문제 없음)
- **후반전** `showLadder = hasPos && !isReverse && cur === 'USD' && T ≥ div/2` — 별지점 단일 구조라 사다리 1개(`B = nb`, `rows=6` 기본)
- **전반전** `showHalfLadder = … && T < div/2` — `calc.ts`의 `halfLadder(nb, byeolPt, avgPt, sym, rows=4)` 사용
  - 기준가: `halfByeolPt = bPrice − tick`, `halfAvgPt = avg − tick`
  - **예산을 `nb/2`씩 쪼개 독립 사다리 2개를 만들면 내림(floor)이 두 번 일어나 배정액을 크게 남긴다** — 실제 사례: `nb=$749.40`, 종가 `$129.10`에서 각 `$374.70`으로 2주+2주=4주(사용 $516)에 그침. 통합이면 `floor(749.40/129.10)=5주`
  - 그래서 첫 단만 나눈다: `byeolQty = qtyFloor(nb/2 / byeolPt)` (별지점만 체결되는 T +0.5 구간의 절반 한도 준수), `avgQty = qtyFloor(nb/avgPt) − byeolQty` (평단 첫 단이 전액 기준 나머지를 흡수)
  - `rungs`는 `nb` 전액 기준 **하나만 공유**: `m = m0+1, …, m0+rows` (`m0 = qtyFloor(nb/avgPt)`), 가격 `nb/m`, 수량 1주 — m번째 체결 = `종가 ≤ nb/m` → `m주 × 종가 ≤ nb` 보장
  - 결과: 평단가 이하 종가에서는 항상 `qtyFloor(nb/종가)` 달성, 별지점~평단 구간은 `nb/2` 한도 유지 → T +0.5 / +1 구분 그대로
  - 주문 수도 10건 → 6건으로 감소
- **첫 진입** `showFirstLadder = isFirst && !isReverse && cur === 'USD'` — 보유 0·평단 0에 매수가만 입력된 상태. 별지점이 없으므로 기준가는 **큰수** `buyPriceNum × FIRST_BIG_MULT`(=1.15, `quant-app.tsx` 모듈 상수)이고 `locLadder(nb, firstBigPt, sym)` 재사용
  - LOC는 종가 ≤ 지정가일 때만 체결되므로 현재가에 걸면 상승 마감 시 미체결. 큰수를 위로 올리면 `floor(nb/큰수)`로 수량이 줄지만 아래 사다리 단이 메꿔주므로 **미체결 방지와 과매수 방지가 동시에** 성립 (예: nb=$1,173.60·현재가 $130 → 큰수 $149.50 × 7주 + ÷8~÷13 각 1주; 종가 $130이면 9주 $1,170, 종가 $97이면 12주 $1,164)
- 각 행 옆 "주문" 버튼 → `openLadderOrder(price, qty, label, alloc = nb)`이 바로 `orderDraft`에 세팅 → 기존 확인 모달 재사용 (별도 입력 없음). `alloc`은 모달의 배정금액 표시용 — 전반전 **별지점 단만** `nb/2`를 넘기고, 평단 단·사다리 단은 `nb` 전액
- `showLadder`/`ladder`/`ladderByeolPt`/`showHalfLadder`/`halfLad`는 모두 파생값 — 별도 state·localStorage 없음 (표시 전용)

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
- 설정 탭 맨 아래 "계좌 동기화" 버튼 — BTC 제외, 주식·ETF 전용
- 클릭 시 `/api/toss/holdings?symbol=` 호출 → 토스 계좌의 보유수량·평단가를 `state.shares`, `state.avg`에 덮어씀
- 동기화 전 `saveSnapshot(sym)`으로 undo 스택 저장 → 되돌리기 가능
- 보유량 0이면 state 업데이트 없이 'empty' 메시지 표시 (0으로 덮어쓰기 방지)
- `syncLoading` / `syncStatus('idle'|'ok'|'error'|'empty')` state로 UI 피드백

## 포트폴리오 ('전체' 탭, Next.js — portfolio.tsx)
- 심볼별 상태와 별개로 동작 — `pf_assets`(자산 목록) / `pf_targets`(목표 비중) 두 키만 사용
- 마운트 시 로컬 값으로 먼저 렌더 → `syncFromSupabase()` 완료 후 다시 읽어 `/api/market` 1회 호출 (기기·배포본 간 공유). `app/api/kv/route.ts`의 `ALLOWED_KEYS`에 `pf_(assets|targets)`가 포함돼 있어야 POST가 통과한다
- `Asset.cat`(`주식`/`코인`/`현금`)으로 묶어 분류별 합계·비중·목표 대비 편차를 표시; 비중 막대에 목표 위치를 세로선으로 겹쳐 그림
- 평가액은 모두 **원화 환산** 후 비교하고, 각 금액 옆(또는 아래)에 달러 환산액을 병기
- 자산 유형별 평가 방식
  - `sym`: `getState(sym)`의 `rem + shares × 현재가`. 현재가는 `/api/market`의 `stocks`, 못 받으면 `avg`로 근사. **BTC 심볼은 토스 미지원**이라 업비트 `KRW-BTC`를 환율로 나눠 달러 가격으로 사용. `conf(sym).currency === 'USD'`면 환율을 곱해 원화로 환산
  - `coin`: `qty × 업비트 시세`. 입력은 **금액(원/달러) 또는 수량** 중 선택 — 금액으로 넣어도 시세로 나눠 **수량으로 저장**하므로 이후 시세 변동이 자동 반영됨. 거래소마다 시세가 달라(김프/역프) 금액 환산에는 오차가 생기므로, 해외 거래소 보유분은 수량 직접 입력이 정확
  - `usd` / `krw`: 고정 금액 (현금성). `usd`는 환율만 적용
- 자산 행의 `수정` 버튼으로 `qty`/`usd`/`krw`를 인라인 편집 (Enter 저장, Esc 취소). **`sym` 자산은 앱 상태에서 자동 계산되므로 수정 버튼 없음**
- 코인 시세는 등록 여부와 무관하게 **항상 전체(KRW-BTC/ETH/SOL)를 조회** — 첫 코인 등록 시 금액→수량 환산에 시세가 필요하기 때문
- 표시 전용 기능이라 undo 스택을 쓰지 않음

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

미국 레버리지 ETF(TQQQ, SOXL), 미국 상장 종목(RAM), 국내 레버리지 ETN(HYNIX2X) 및 BTC 현물 **분할매수 전략** 수동 매매 보조 계산기.  
수동으로 매매 체결 후 기록하면 T값·별지점·지정가매도 목표가를 자동 계산한다.

## 실행 방법

```bash
# Next.js 앱 (주 사용 방법) — 루트에서 실행 가능
npm run dev
# 로컬: http://localhost:3000
# 배포: https://quant-red.vercel.app

# 레거시 바닐라 UI (서버 없이 열기)
open index.html

# 터미널 CLI (선택)
source venv/bin/activate
python trade.py status
python trade.py buy TQQQ 250 --price 73.05
python trade.py sell TQQQ quarter
python trade.py sell TQQQ all
python trade.py init TQQQ 10000 40
```

## 아키텍처

```
app/                    ← Next.js 16 + shadcn UI (주 UI)
  app/
    page.tsx            ← 심볼 탭(TQQQ/SOXL/HYNIX2X/BTC/RAM) + QuantApp 마운트
    layout.tsx          ← Merriweather + JetBrains Mono 폰트
    globals.css         ← shadcn 테마 (warm earthy palette)
  components/
    quant-app.tsx       ← "use client" 메인 컴포넌트. 전체 상태·핸들러 보유
  lib/
    types.ts            ← TypeScript 타입 (SymbolState, HistoryEntry 등)
    calc.ts             ← 순수 계산 함수 (bPrice, ftPrice, nextAmt, qtyFloor 등)
    storage.ts          ← localStorage read/write + Supabase 동기화 (getState, setHist 등)
    supabase.ts         ← Supabase 클라이언트 (환경변수에서 URL/key 읽음)
    toss.ts             ← 토스증권 Open API 헬퍼 — TOSS_PROXY_URL 설정 시 프록시 경유, 미설정 시 직접 호출
                           fetchPrice / fetchFiveDayAvg / fetchHoldings / createOrder(OrderParams)
                           fetchOpenOrders(symbol) — 미체결 주문 조회 (Toss API: GET /api/v1/orders?status=OPEN, result.orders 배열)
                           cancelOrder(orderId) — 주문 취소 (Toss API: POST /api/v1/orders/:orderId/cancel)
                           SYMBOL_MAP으로 앱 심볼 → 토스 종목코드 변환 (HYNIX2X→0195S0)
                           주문 에러 구조: { error: { code, message } } — message 필드로 추출
  app/
    api/
      toss/
        price/route.ts    ← GET /api/toss/price?symbol= (현재가, 소수점 2자리)
        candles/route.ts  ← GET /api/toss/candles?symbol= (전 5거래일 종가 평균)
        holdings/route.ts ← GET /api/toss/holdings?symbol= (보유수량·평단가 조회)
        order/route.ts    ← GET /api/toss/order?symbol= (미체결 주문 조회) / POST /api/toss/order (주문 전송 — BTC 제외)
        order/[orderId]/route.ts ← DELETE /api/toss/order/:orderId (주문 취소)

tossapi/
  server.js             ← Oracle Cloud VM에서 실행하는 토스 API 프록시 서버 (포트 3001)
                           GET /price?symbol= / GET /candles?symbol= / GET /holdings?symbol=
                           GET /orders?symbol= (미체결 주문 조회, symbol 필터는 선택)
                           POST /order (주문 전송) / POST /order/:orderId/cancel (주문 취소)
                           PROXY_SECRET 환경변수로 인증; accountSeq 모듈 레벨 캐싱
                           **실제 실행 경로: /home/ubuntu/proxy/server.js**
                           **프로세스 관리: pm2** (무중단 배포 지원)
                           로컬 tossapi/server.js 수정 후 배포 시:
                             scp -i ~/.ssh/oracle-vm.key tossapi/server.js ubuntu@161.33.168.105:~/proxy/server.js
                             ssh -i ~/.ssh/oracle-vm.key ubuntu@161.33.168.105 "pm2 reload toss-proxy"
                           환경변수 변경이 필요할 때 (최초 설정 또는 갱신):
                             ssh -i ~/.ssh/oracle-vm.key ubuntu@161.33.168.105
                             TOSS_CLIENT_ID='값' TOSS_CLIENT_SECRET='값' PROXY_SECRET='값' pm2 restart toss-proxy --update-env && pm2 save
                           주의: pm2는 환경변수를 자동 상속하지 않으므로 --update-env 없이 restart하면 기존 값 유지, 신규 설정은 반드시 위 명령 사용

index.html              ← 레거시 바닐라 JS UI (localStorage, 서버 불필요)
trade.py                ← 터미널 CLI
calculator.py           ← Python 계산 함수
state.py                ← StateManager: state.json 읽기/쓰기
config.py               ← 종목별 파라미터 (SYMBOLS dict)
```

**주의**:
- `app/`(localStorage+Supabase)과 Python(state.json)은 **상태를 공유하지 않는다.**
- `index.html`과 `app/`도 **상태를 공유하지 않는다.** (각자 localStorage 키 사용)
- Next.js 앱은 전체가 `"use client"` — SSR 없음

## 데이터 동기화 구조

- **쓰기**: localStorage에 즉시 저장 + Supabase `kv_store`에 비동기 upsert
- **읽기**: 앱 마운트 시 Supabase → localStorage 동기화 후 렌더링 (`syncFromSupabase`)
- 기기간 데이터 공유는 Supabase를 통해 이루어짐
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local`)
- 토스 API 호출 구조: `TOSS_PROXY_URL`이 설정되면 Oracle VM 프록시 경유, 미설정이면 `TOSS_CLIENT_ID`/`TOSS_CLIENT_SECRET`으로 직접 호출 (로컬 개발용)
- Vercel 환경변수: `TOSS_PROXY_URL=http://161.33.168.105:3001`, `PROXY_SECRET` (프록시 인증키)
- Oracle VM(161.33.168.105)에서 `tossapi/server.js`가 pm2로 상시 실행 중
- 토스증권 토큰은 Oracle VM 프록시 내 모듈 레벨 변수로 캐싱, 만료 1분 전 자동 갱신

## Next.js 앱 주요 패턴

- 심볼 전환 시 `<QuantApp key={sym} sym={sym} />` 로 컴포넌트 완전 리마운트
- localStorage 변경 후 `setTick(t => t + 1)` 으로 리렌더 트리거
- `mounted` 패턴: Supabase sync 완료 후 `setMounted(true)` → hydration 오류 방지
- `JournalTab`은 내부 `useState`로 page·open·tick 상태 독립 관리; tick으로 즉시 리렌더 트리거; 펼치면 `JournalEntry.trades`(체결내역 배열) 표시 — 사이클 종료 시점에 저장됨, 기존 항목은 undefined
- `TradeHistory`는 `tab` prop을 받아 매수탭(buy/rbuy)·매도탭(quarter/all/rsell) 필터링; 로컬 `tick` state로 전체 삭제 즉시 반영
- 되돌리기 스택은 `UNDO_LIMIT = 10` (storage.ts) — 초과 시 오래된 것부터 삭제
- `lastQuarterProceeds`: 쿼터매도 직후 수익(sell × price)을 보관하는 state — 설정 탭 잔여자본 수정 UI에서 25%/50%/100% 재투입 버튼에 활용; `lqp_${sym}` localStorage 키로 영속화되므로 심볼 전환 후에도 유지됨; 재투입 버튼 클릭 시 0으로 초기화(`setLastQP(sym, 0)`)
- `total`(총 자본)은 표시 전용 — 모든 매수금액 계산은 `rem`만 사용. 설정 탭에서 직접 수정 가능; 보유주식이 있으면 `rem + shares × avg` 추정값을 클릭 한 번으로 채울 수 있음
- `conf(sym).decimals` / `conf(sym).unit`: 심볼별 수량 소수점 자리수(주식 0, BTC 6)와 단위('주' / 'BTC') — `qtyFloor(qty, sym)`로 sym-aware 수량 내림 처리
- BTC 탭은 T+0.5(절반 체결) 옵션 없음 — 항상 T+1 고정; 매수가 입력 시 권장 BTC 수량 자동계산
- 설정 탭 "SGOV 파킹 계산" (USD 주식·일반모드 전용): N회차분 매수금액만 현금으로 남기고 나머지 SGOV 파킹 권장액 표시 — `/api/toss/price·holdings?symbol=SGOV`로 현재가·보유량 비교, 표시 전용(state 미변경), 회차 수는 `park_${sym}` 키 저장 (상세: ui-structure.md)

## 문서
기능 추가·변경 시 `docs/README.md` 함께 업데이트

## 토스증권 API 참조
토스증권 API 관련 수정·확인이 필요할 때는 반드시 `tossapi/api` 파일(OpenAPI 3.1 스펙, 242KB JSON)을 먼저 확인할 것.
엔드포인트 경로, 요청/응답 구조, 에러 코드 등 공식 스펙은 이 파일이 최종 기준이다.

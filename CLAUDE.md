# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

미국 레버리지 ETF(TQQQ, SOXL) 전용 **분할매수 전략** 수동 매매 보조 계산기.  
수동으로 매매 체결 후 기록하면 T값·별지점·지정가매도 목표가를 자동 계산한다.

## 실행 방법

```bash
# Next.js 앱 (주 사용 방법) — 모바일 접속 가능
cd app && npm run dev
# 로컬: http://localhost:3000
# 모바일(같은 와이파이): http://192.168.x.x:3000

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
    page.tsx            ← 심볼 탭(TQQQ/SOXL) + QuantApp 마운트
    layout.tsx          ← Merriweather + JetBrains Mono 폰트
    globals.css         ← shadcn 테마 (warm earthy palette)
  components/
    quant-app.tsx       ← "use client" 메인 컴포넌트. 전체 상태·핸들러 보유
  lib/
    types.ts            ← TypeScript 타입 (SymbolState, HistoryEntry 등)
    calc.ts             ← 순수 계산 함수 (bPrice, ftPrice, nextAmt 등)
    storage.ts          ← localStorage read/write 유틸 (getState, setHist 등)

index.html              ← 레거시 바닐라 JS UI (localStorage, 서버 불필요)
trade.py                ← 터미널 CLI
calculator.py           ← Python 계산 함수
state.py                ← StateManager: state.json 읽기/쓰기
config.py               ← 종목별 파라미터 (SYMBOLS dict)
```

**주의**:
- `app/`(localStorage)과 Python(state.json)은 **상태를 공유하지 않는다.**
- `index.html`과 `app/`도 **상태를 공유하지 않는다.** (각자 localStorage 키 사용)
- Next.js 앱은 전체가 `"use client"` — SSR 없음, localStorage 전용

## Next.js 앱 주요 패턴

- 심볼 전환 시 `<QuantApp key={sym} sym={sym} />` 로 컴포넌트 완전 리마운트
- localStorage 변경 후 `setTick(t => t + 1)` 으로 리렌더 트리거
- `JournalTab`은 내부 `useState`로 page·open 상태 독립 관리
- `TradeHistory`는 렌더 시마다 localStorage에서 직접 읽음 (props 없음)

## 문서
기능 추가·변경 시 `docs/README.md` 함께 업데이트

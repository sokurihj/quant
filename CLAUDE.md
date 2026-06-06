# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

미국 레버리지 ETF(TQQQ, SOXL) 전용 **무한매수법 V4.0** 수동 매매 보조 계산기.  
수동으로 매매 체결 후 기록하면 T값·별지점·지정가매도 목표가를 자동 계산한다.

## 실행 방법

```bash
# 브라우저 UI (주 사용 방법) — 설치 없이 바로 열기
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
index.html      ← 브라우저 UI. 계산·상태를 JS로 자체 구현 (localStorage 저장)
trade.py        ← 터미널 CLI. 아래 Python 모듈을 사용

calculator.py   ← 순수 계산 함수 (부수효과 없음)
state.py        ← StateManager: state.json 읽기/쓰기, SymbolState dataclass
config.py       ← 종목별 파라미터 (SYMBOLS dict)
```

**주의**: `index.html`(localStorage)과 Python(state.json)은 **상태를 공유하지 않는다.**

## 핵심 도메인 로직

### 별지점 공식
```
TQQQ 40분할: 평단 × (1 + (15 - 0.75×T) %)
TQQQ 20분할: 평단 × (1 + (15 - 1.5×T)  %)
SOXL 40분할: 평단 × (1 + (20 - 1.0×T)  %)
SOXL 20분할: 평단 × (1 + (20 - 2.0×T)  %)
```
- 음수 허용 — T > 분할수/2(후반전)에서 별지점이 평단 아래로 내려감
- 매수점 = 별지점 − $0.01 (LOC 매수/매도 겹침 방지)

### T값 규칙
- 전체 체결 매수: T += 1
- 절반 체결 매수 (전반전에서 별지점 LOC만 체결): T += 0.5
- 쿼터매도 후: T × 0.75
- 지정가매도(잔여 3/4) 체결 후 보유수량 0: 사이클 종료, T = 0

### 1회 매수금액
```
잔여자본 ÷ (분할수 - T)
```
공식을 정확히 따르면 매 회차 금액이 일정하게 유지된다. 쿼터매도 등으로 잔금이 변동되면 자동 보정된다.

### 매도 구조
- **쿼터매도**: 보유량 1/4을 별지점에서 매도 → T × 0.75
- **지정가매도**: 남은 3/4을 고정 목표가(TQQQ +15%, SOXL +20%)에서 매도

### 리버스모드
- 발동: T > 분할수 − 1 (원금 소진)
- 매도: 보유량 ÷ 분할수 내림 (D1: MOC 무조건, D2~: 별지점=5거래일평균 위 LOC)
- 매수: 잔금 ÷ 4 (D1 없음, D2~: 별지점 아래 LOC)
- T 매도 후: ×0.95(40분할) / ×0.90(20분할)
- T 매수 후: T + (분할수 - T) × 0.25
- 종료 조건: 종가 > 평단 × (1 - target_pct/100) → 다음날 일반모드 복귀, T 승계

### 소스 문서
`src/` 폴더에 오피셜 스펙 .md 파일 보관 — 기능 추가 전 반드시 참조
- `src/무한매수법 V4.0 · 일반모드.md`
- `src/무한매수법 V4.0 · 리버스모드.md`
- `src/별지점 계산기.md`

## index.html JS 구조 주의사항

- `render()` 함수 내 state 변수명: `state` (destructured: `{ T, avg, shares, rem, div }`)
- `handleBuy/handleSell` 함수 내 state 변수명: `s = ls(\`st_\${sym}\`)`
- 두 컨텍스트에서 변수명이 다르므로 혼용 금지
- 쿼터매도 시 `s.rem` 미변경은 의도된 설계 (수익은 전략 외부로 빠짐)
- 쿼터매도 수량은 `Math.floor(shares * 0.25)` — 온주 처리

## 문서
기능 추가·변경 시 `docs/README.md` 함께 업데이트

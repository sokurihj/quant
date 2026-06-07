# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

미국 레버리지 ETF(TQQQ, SOXL) 전용 **분할매수 전략** 수동 매매 보조 계산기.  
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

## 문서
기능 추가·변경 시 `docs/README.md` 함께 업데이트

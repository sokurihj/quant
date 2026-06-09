---
name: update-quant-docs
description: >
  quant 트레이딩 계산기 프로젝트(/Users/hajun/Trading/quant)에서 코드 변경 후
  3개 문서 파일(CLAUDE.md, domain-logic.md, ui-structure.md)을 최신 상태로 동기화한다.
  다음 상황에서 반드시 사용: 기능 추가/변경 후 "문서 업데이트", "rules 업데이트",
  "CLAUDE.md 업데이트", 심볼 추가, 로직 변경, UI 구조 변경, 상태 필드 추가/삭제.
  코드 수정이 완료된 직후 사용자가 명시적으로 요청하지 않아도 문서가 오래됐을 가능성이
  있으면 자동으로 제안할 것.
---

# quant 문서 동기화 스킬

## 관리 대상 파일 3개

| 파일 | 경로 | 담당 내용 |
|------|------|----------|
| CLAUDE.md | `/Users/hajun/Trading/quant/CLAUDE.md` | 프로젝트 개요, 아키텍처, 실행법, 주요 패턴 |
| domain-logic.md | `/Users/hajun/Trading/quant/.claude/rules/domain-logic.md` | 별지점 공식, T값 규칙, 매수/매도 구조, 리버스모드 |
| ui-structure.md | `/Users/hajun/Trading/quant/.claude/rules/ui-structure.md` | index.html JS 패턴, localStorage 키, state 필드, 탭 구조 |

## 실행 절차

### 1. 변경 범위 파악

현재 대화에서 무엇이 바뀌었는지 먼저 파악한다. 대화 컨텍스트로 충분하면 그것을 사용하고, 불명확하면 git diff를 확인한다.

```bash
# 최근 커밋 기준 변경사항
git -C /Users/hajun/Trading/quant diff HEAD~1 HEAD --stat

# 또는 스테이징 포함 전체
git -C /Users/hajun/Trading/quant diff HEAD
```

### 2. 파일별 업데이트 판단 기준

변경된 내용을 보고 각 파일에 영향이 있는지 판단한다.

**CLAUDE.md를 업데이트해야 할 때**
- 새 심볼/종목 추가 (예: HYNIX2X)
- 새 파일/컴포넌트 추가 또는 삭제
- 아키텍처 구조 변경
- 새로운 핵심 패턴 추가 (예: 새 state 관리 방식)
- 환경변수 추가
- 실행 방법 변경

**domain-logic.md를 업데이트해야 할 때**
- 별지점 공식 변경
- T값 계산 규칙 변경
- 1회 매수금액 공식 변경
- 매수/매도 구조 변경 (전반전/후반전 기준 등)
- 리버스모드 로직 변경
- 새 전략 로직 추가

**ui-structure.md를 업데이트해야 할 때**
- localStorage 키 추가/변경/삭제
- SymbolState 필드 추가/변경/삭제
- 탭 구조 변경 (탭 추가/이름 변경)
- index.html의 핵심 함수 동작 방식 변경
- 매수/매도 입력 방식 변경
- 사이클 종료 흐름 변경

### 3. 외과적 수정

업데이트가 필요한 파일만, 필요한 부분만 수정한다.

- 내용이 여전히 맞으면 건드리지 않는다
- 새 항목 추가 시 기존 구조와 형식을 맞춘다
- 삭제된 기능은 문서에서도 제거한다
- 이미 문서에 있는 내용을 재서술하지 않는다

### 4. 완료 보고

수정한 파일과 변경 내용을 한 줄씩 요약해서 보고한다.

```
✓ CLAUDE.md — HYNIX2X 심볼 아키텍처 설명에 추가
✓ ui-structure.md — lastQuarterProceeds state 필드 추가
✗ domain-logic.md — 변경사항 없음
```

## 주의사항

- 문서에 없는 내용을 추론으로 채우지 말 것 — 코드에서 확인된 것만 기록
- 3개 파일 모두 확인하되, 변경이 필요없는 파일은 수정하지 않음
- `docs/README.md`도 CLAUDE.md에 명시된 대로 함께 업데이트 필요 여부 확인

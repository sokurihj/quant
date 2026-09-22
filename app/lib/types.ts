export type Symbol = 'TQQQ' | 'SOXL' | 'HYNIX2X' | 'BTC' | 'RAM';
export type Mode = 'normal' | 'reverse';
export type TabName = 'buy' | 'sell' | 'journal' | 'setting' | 'guide';

export interface SymbolState {
  T: number;
  avg: number;
  shares: number;
  rem: number;
  total: number;
  div: 10 | 20 | 40;
  cycle: number;
  mode: Mode;
  reverseDay: number;
  cycleStartRem: number;
  cycleStartDate: string | null;
  cycleSeed: number;
}

export interface HistoryEntry {
  type: 'buy' | 'quarter' | 'all' | 'rsell' | 'rbuy';
  shares: number;
  price: number;
  amount: number;
  T: number;
  date: string;
  reinv?: boolean; // 쿼터매도 수익을 잔여자본에 재투입했는지 (사이클 종료 수익 계산에서 중복 가산 방지)
}

export interface JournalEntry {
  cycle: number;
  div: number;
  startRem: number;
  endRem: number;
  profit: number;
  profitPct: number;
  startDate: string;
  endDate: string;
  trades?: HistoryEntry[];
}

export interface UndoSnapshot {
  state: SymbolState;
  histLen: number;
}

// 포트폴리오 비중 관리용 자산 항목
// 평가액 계산 방식은 아래 셋 중 하나로 결정된다
//   sym  : 앱에서 운용 중인 심볼 → 잔여자본 + 보유주식 × 현재가
//   coin : 업비트 마켓코드(KRW-BTC 등) → 수량 × 업비트 시세
//   usd / krw : 고정 금액 (현금성 자산)
export interface Asset {
  id: string;
  name: string;
  cat: '주식' | '코인' | '현금';
  sym?: Symbol;
  coin?: string;
  qty?: number;
  usd?: number;
  krw?: number;
}

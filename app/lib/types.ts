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

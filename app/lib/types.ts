export type Symbol = 'TQQQ' | 'SOXL' | 'HYNIX2X' | 'BTC';
export type Mode = 'normal' | 'reverse';
export type TabName = 'buy' | 'sell' | 'journal' | 'setting';

export interface SymbolState {
  T: number;
  avg: number;
  shares: number;
  rem: number;
  total: number;
  div: 20 | 40;
  cycle: number;
  mode: Mode;
  reverseDay: number;
  cycleStartRem: number;
  cycleStartDate: string | null;
}

export interface HistoryEntry {
  type: 'buy' | 'quarter' | 'all' | 'rsell' | 'rbuy';
  shares: number;
  price: number;
  amount: number;
  T: number;
  date: string;
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

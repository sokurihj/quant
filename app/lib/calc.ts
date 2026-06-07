import type { Symbol, SymbolState } from './types';

const CONF = {
  TQQQ: { target_pct: 15, byeol_base: 15, slope: { 20: 1.5,  40: 0.75 } },
  SOXL: { target_pct: 20, byeol_base: 20, slope: { 20: 2.0,  40: 1.0  } },
} as const;

export const conf = (sym: Symbol) => CONF[sym];

export const bPct   = (sym: Symbol, div: number, T: number) =>
  CONF[sym].byeol_base - CONF[sym].slope[div as 20 | 40] * T;

export const bPrice = (avg: number, sym: Symbol, div: number, T: number) =>
  avg * (1 + bPct(sym, div, T) / 100);

export const ftPrice = (avg: number, sym: Symbol) =>
  avg * (1 + CONF[sym].target_pct / 100);

export const nextAmt = (rem: number, div: number, T: number) =>
  (div - T) <= 0 ? 0 : rem / (div - T);

export const newAvg = (oA: number, oS: number, p: number, s: number) =>
  (oA * oS + p * s) / (oS + s);

export const revTSell = (T: number, div: number) =>
  parseFloat((T * (div === 20 ? 0.9 : 0.95)).toFixed(4));

export const revTBuy = (T: number, div: number) =>
  parseFloat((T + (div - T) * 0.25).toFixed(4));

export const revSellQty = (shares: number, div: number) =>
  Math.floor(shares / div);

export const shouldEnterReverse = (T: number, div: number) => T > div - 1;

export const revExitThreshold = (avg: number, sym: Symbol) =>
  avg * (1 - CONF[sym].target_pct / 100);

export const defState = (capital = 10000, division: 20 | 40 = 40): SymbolState => ({
  T: 0, avg: 0, shares: 0, rem: capital, total: capital,
  div: division, cycle: 1, mode: 'normal', reverseDay: 0,
  cycleStartRem: capital, cycleStartDate: null,
});

export const fmt = (n: number | null | undefined, d = 2): string =>
  n == null ? '—' : '$' + n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

import type { Symbol, SymbolState, HistoryEntry } from './types';

const CONF = {
  TQQQ:    { target_pct: 15, byeol_base: 15, slope: { 20: 1.5,  40: 0.75 }, currency: 'USD', tick: 0.01, decimals: 0, unit: '주' },
  SOXL:    { target_pct: 20, byeol_base: 20, slope: { 20: 2.0,  40: 1.0  }, currency: 'USD', tick: 0.01, decimals: 0, unit: '주' },
  HYNIX2X: { target_pct: 20, byeol_base: 20, slope: { 20: 2.0,  40: 1.0  }, currency: 'KRW', tick: 5,   decimals: 0, unit: '주' },
  BTC:     { target_pct: 15, byeol_base: 15, slope: { 10: 3.0, 20: 2.0,  40: 1.0  }, currency: 'USD', tick: 0.1,  decimals: 6, unit: 'BTC' },
  RAM:     { target_pct: 20, byeol_base: 20, slope: { 20: 2.0,  40: 1.0  }, currency: 'USD', tick: 0.01, decimals: 0, unit: '주' },
} as const;

export const conf = (sym: Symbol) => CONF[sym];

export const bPct   = (sym: Symbol, div: number, T: number) =>
  CONF[sym].byeol_base - (CONF[sym].slope as Record<number, number>)[div] * T;

export const bPrice = (avg: number, sym: Symbol, div: number, T: number) =>
  avg * (1 + bPct(sym, div, T) / 100);

export const ftPrice = (avg: number, sym: Symbol) =>
  avg * (1 + CONF[sym].target_pct / 100);

export const targetPrice = (price: number, sym: Symbol) =>
  CONF[sym].currency === 'KRW' ? Math.floor(price / 10) * 10 : price;

export const nextAmt = (rem: number, div: number, T: number) =>
  (div - T) <= 0 ? 0 : rem / (div - T);

export const newAvg = (oA: number, oS: number, p: number, s: number) =>
  (oA * oS + p * s) / (oS + s);

export const revTSell = (T: number, div: number) =>
  parseFloat((T * (1 - 2 / div)).toFixed(4));

export const revTBuy = (T: number, div: number) =>
  parseFloat((T + (div - T) * 0.25).toFixed(4));

export const qtyFloor = (qty: number, sym: Symbol) => {
  const d = CONF[sym].decimals;
  return d === 0 ? Math.floor(qty) : parseFloat(qty.toFixed(d));
};

export const revSellQty = (shares: number, div: number, sym: Symbol) =>
  qtyFloor(shares / div, sym);

export const shouldEnterReverse = (T: number, div: number) => T > div - 1;

export const revExitThreshold = (avg: number, sym: Symbol) =>
  avg * (1 - CONF[sym].target_pct / 100);

export const defState = (capital = 10000, division: 10 | 20 | 40 = 40): SymbolState => ({
  T: 0, avg: 0, shares: 0, rem: capital, total: capital,
  div: division, cycle: 1, mode: 'normal', reverseDay: 0,
  cycleStartRem: capital, cycleStartDate: null, cycleSeed: capital,
});

// 토스증권 해외주식 수수료: 매수/매도 각 0.1% + 매도 시 SEC Fee 0.00206%
const BUY_FEE_PCT = 0.001;
const SELL_FEE_PCT = 0.001 + 0.0000206;

// HYNIX2X(국내)·BTC는 수수료 구조가 달라 매매일지 수익 계산에서 제외
const isFeeSymbol = (sym: Symbol) => CONF[sym].currency === 'USD' && sym !== 'BTC';

export const tradeFee = (h: Pick<HistoryEntry, 'type' | 'amount'>, sym: Symbol) => {
  if (!isFeeSymbol(sym)) return 0;
  const isBuy = h.type === 'buy' || h.type === 'rbuy';
  return h.amount * (isBuy ? BUY_FEE_PCT : SELL_FEE_PCT);
};

export const totalFees = (trades: Pick<HistoryEntry, 'type' | 'amount'>[], sym: Symbol) =>
  trades.reduce((sum, h) => sum + tradeFee(h, sym), 0);

export const fmt = (n: number | null | undefined, d = 2, currency = 'USD'): string => {
  if (n == null) return '—';
  if (currency === 'KRW') return '₩' + Math.round(n).toLocaleString('ko-KR');
  return '$' + n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Symbol, TabName, SymbolState, HistoryEntry, JournalEntry } from '@/lib/types';
import { defState, bPct, bPrice, ftPrice, nextAmt, newAvg, revTSell, revTBuy, revSellQty, qtyFloor, shouldEnterReverse, fmt, conf } from '@/lib/calc';
import { getState, setState, getHist, setHist, getJournal, setJournal, getUndo, setUndo, saveSnapshot, syncFromSupabase, getLastQP, setLastQP } from '@/lib/storage';

// ── 서브 컴포넌트 ──────────────────────────────────────────────────────────

function StatusBar({ s, sym }: { s: SymbolState; sym: Symbol }) {
  const f = (n: number | null | undefined, d = 2) => fmt(n, d, conf(sym).currency);
  const isReverse = s.mode === 'reverse';
  const pct = Math.min(s.T / s.div * 100, 100);
  const hasPos = s.avg > 0 && s.shares > 0;
  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <div className="p-3 border-r border-b sm:border-b-0 border-border">
          <p className="text-xs text-muted-foreground mb-1">평단가</p>
          <p className="font-mono text-sm font-semibold">{hasPos ? f(s.avg) : '—'}</p>
        </div>
        <div className="p-3 border-b sm:border-b-0 sm:border-r border-border">
          <p className="text-xs text-muted-foreground mb-1">{sym === 'BTC' ? '보유수량' : '보유주식'}</p>
          <p className="font-mono text-sm font-semibold">{hasPos ? `${s.shares.toFixed(conf(sym).decimals || 4)}${conf(sym).unit}` : '—'}</p>
        </div>
        <div className="p-3 border-r border-border">
          <p className="text-xs text-muted-foreground mb-1">총 자본</p>
          <p className="font-mono text-sm font-semibold text-muted-foreground">{f(s.total ?? s.rem)}</p>
        </div>
        <div className="p-3">
          <p className="text-xs text-muted-foreground mb-1">잔여자본</p>
          <p className="font-mono text-sm font-semibold text-muted-foreground">{f(s.rem)}</p>
        </div>
      </div>
      <div className="px-4 py-2 border-t border-border">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>{isReverse ? '리버스 진행도' : 'T값 진행도'}</span>
          <span className="font-mono">{s.T.toFixed(2)} / {s.div}</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isReverse ? 'bg-destructive' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TargetCards({ s, sym, revByeol }: { s: SymbolState; sym: Symbol; revByeol: string }) {
  const c = conf(sym);
  const f = (n: number | null | undefined, d = 2) => fmt(n, d, c.currency);
  const fd = (n: number) => f(c.currency === 'KRW' ? Math.floor(n / 10) * 10 : n);
  const hasPos = s.avg > 0 && s.shares > 0;
  const isReverse = s.mode === 'reverse';

  if (isReverse) {
    const qty = hasPos ? revSellQty(s.shares, s.div, sym) : 0;
    const rdAmt = s.reverseDay > 0 ? s.rem / 4 : 0;
    return (
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-destructive/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">오늘 매도 수량</p>
          <p className="font-mono text-xl font-bold text-destructive">{hasPos ? `${qty}${c.unit}` : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{hasPos ? `${s.shares.toFixed(c.decimals || 4)}${c.unit} ÷ ${s.div}` : '—'}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">리버스 별지점</p>
          <p className="font-mono text-xl font-bold">{revByeol ? f(parseFloat(revByeol)) : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">5거래일 종가 평균</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">오늘 매수금액</p>
          <p className="font-mono text-xl font-bold">{s.reverseDay > 0 ? f(rdAmt) : '없음 (D1)'}</p>
          <p className="text-xs text-muted-foreground mt-1">{s.reverseDay > 0 ? `${f(s.rem)} ÷ 4` : '첫날은 매도만'}</p>
        </div>
      </div>
    );
  }

  if (!hasPos) {
    const nb = s.rem / s.div;
    return (
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-primary/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">별지점</p>
          <p className="font-mono text-xl font-bold text-primary">—</p>
          <p className="text-xs text-muted-foreground mt-1">매수 후 계산됩니다</p>
        </div>
        <div className="bg-card border border-chart-1/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">지정가 목표</p>
          <p className="font-mono text-xl font-bold text-chart-1">—</p>
          <p className="text-xs text-muted-foreground mt-1">매수 후 계산됩니다</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">오늘 매수금액</p>
          <p className="font-mono text-xl font-bold">{f(nb)}</p>
          <p className="text-xs text-muted-foreground mt-1">{f(s.rem)} ÷ {s.div}</p>
        </div>
      </div>
    );
  }

  const bp = bPct(sym, s.div, s.T);
  const bpr = bPrice(s.avg, sym, s.div, s.T);
  const buyPt = parseFloat((bpr - c.tick).toFixed(2));
  const ft = ftPrice(s.avg, sym);
  const nb = nextAmt(s.rem, s.div, s.T);
  const isNeg = bp < 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className={`bg-card border rounded-lg p-3 ${isNeg ? 'border-destructive/40' : 'border-primary/40'}`}>
        <p className="text-xs text-muted-foreground mb-2">별지점 (쿼터매도)</p>
        <p className={`font-mono text-xl font-bold ${isNeg ? 'text-destructive' : 'text-primary'}`}>{fd(bpr)}</p>
        <p className={`text-xs mt-1 ${isNeg ? 'text-destructive' : 'text-muted-foreground'}`}>
          평단 대비 {bp >= 0 ? '+' : ''}{bp.toFixed(2)}%
        </p>
        <p className="text-xs text-muted-foreground/50 mt-0.5">매수점: {fd(buyPt)}</p>
      </div>
      <div className="bg-card border border-chart-1/40 rounded-lg p-3">
        <p className="text-xs text-muted-foreground mb-2">지정가 목표 (잔여 ¾)</p>
        <p className="font-mono text-xl font-bold text-chart-1">{fd(ft)}</p>
        <p className="text-xs text-muted-foreground mt-1">평단 대비 +{c.target_pct}%</p>
      </div>
      <div className="bg-card border border-border rounded-lg p-3">
        <p className="text-xs text-muted-foreground mb-2">오늘 매수금액</p>
        <p className="font-mono text-xl font-bold">{nb > 0 ? f(nb) : '소진'}</p>
        <p className="text-xs text-muted-foreground mt-1">{nb > 0 ? `${s.div}분할 ${Math.floor(s.T) + 1}회차` : '리버스 대기'}</p>
      </div>
    </div>
  );
}

function LocGuide({ s, sym }: { s: SymbolState; sym: Symbol }) {
  if (s.mode === 'reverse' || !(s.avg > 0 && s.shares > 0)) return null;
  const c = conf(sym);
  const f = (n: number | null | undefined, d = 2) => fmt(n, d, c.currency);
  const fd = (n: number) => f(c.currency === 'KRW' ? Math.floor(n / 10) * 10 : n);
  const tickStr = c.currency === 'KRW' ? `₩${c.tick}` : `$${c.tick}`;
  const bp = bPct(sym, s.div, s.T);
  const bpr = bPrice(s.avg, sym, s.div, s.T);
  const buyPt = parseFloat((bpr - c.tick).toFixed(2));
  const nb = nextAmt(s.rem, s.div, s.T);
  const half = nb / 2;
  const avgPt = parseFloat((s.avg - c.tick).toFixed(2));
  const isSecondHalf = s.T >= s.div / 2;
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/40">
        <p className="text-xs text-muted-foreground">
          오늘 {sym === 'BTC' ? '지정가' : 'LOC'} 매수 방법 · <span className="text-foreground font-medium">{isSecondHalf ? '후반전' : '전반전'}</span>
        </p>
      </div>
      <div className="divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold bg-primary/15 text-primary px-2 py-0.5 rounded">별지점</span>
            <div>
              <p className="font-mono text-sm font-semibold">{fd(buyPt)} 이하 {sym === 'BTC' ? '지정가' : 'LOC'}</p>
              <p className="text-xs text-muted-foreground">별지점 {fd(bpr)} − {tickStr}{bp < 0 ? ' · 평단 아래' : ''}</p>
            </div>
          </div>
          <span className="font-mono text-sm font-semibold text-primary">{f(isSecondHalf || sym === 'BTC' ? nb : half)}</span>
        </div>
        {!isSecondHalf && sym !== 'BTC' && (
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded">평단가</span>
              <div>
                <p className="font-mono text-sm font-semibold">{fd(avgPt)} 이하 LOC</p>
                <p className="text-xs text-muted-foreground">평단 {f(s.avg)} − {tickStr}</p>
              </div>
            </div>
            <span className="font-mono text-sm font-semibold text-primary">{f(half)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TradeHistory({ sym, onUndo, tab }: { sym: Symbol; onUndo: () => void; tab: TabName }) {
  const f = (n: number | null | undefined, d = 2) => fmt(n, d, conf(sym).currency);
  const [tick, setTick] = useState(0);
  const allHist = getHist(sym);
  const buyTypes = new Set(['buy', 'rbuy']);
  const sellTypes = new Set(['quarter', 'all', 'rsell']);
  const hist = tab === 'buy'
    ? allHist.filter(h => buyTypes.has(h.type))
    : tab === 'sell'
    ? allHist.filter(h => sellTypes.has(h.type))
    : allHist;
  const undoStack = getUndo(sym);
  const label: Record<string, string> = { buy:'매수', quarter:'쿼터매도', all:'전량매도', rsell:'리버스매도', rbuy:'리버스매수' };
  const color: Record<string, string> = {
    buy: 'text-emerald-500', quarter: 'text-red-500', all: 'text-red-400',
    rsell: 'text-red-500', rbuy: 'text-emerald-500',
  };
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">거래 내역</span>
        <div className="flex gap-3">
          {undoStack.length > 0 && (
            <button onClick={onUndo} className="text-xs text-muted-foreground hover:text-foreground transition-colors">되돌리기</button>
          )}
          <button onClick={() => { setHist(sym, []); setTick(t => t + 1); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">전체 삭제</button>
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto">
        {hist.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">아직 기록된 거래가 없습니다</p>
        ) : (
          [...hist].reverse().map((h, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 border-b border-border/50 last:border-none">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold w-14 ${color[h.type]}`}>{label[h.type]}</span>
                <span className="font-mono text-xs">{h.shares.toFixed(conf(sym).decimals || 4)}{conf(sym).unit} @ {f(h.price)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs">{f(h.amount)}</span>
                <span className="font-mono text-xs text-muted-foreground">T={h.T.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground">{h.date}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function JournalTab({ sym }: { sym: Symbol }) {
  const f = (n: number | null | undefined, d = 2) => fmt(n, d, conf(sym).currency);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const PAGE_SZ = 5;
  const journal = getJournal(sym);
  const reversed = [...journal].reverse();
  const totalPages = Math.ceil(reversed.length / PAGE_SZ);
  const items = reversed.slice((page - 1) * PAGE_SZ, page * PAGE_SZ);

  const del = (origIdx: number) => {
    const j = getJournal(sym);
    j.splice(origIdx, 1);
    setJournal(sym, j);
    const tp = Math.ceil(j.length / PAGE_SZ);
    if (page > tp && tp > 0) setPage(tp);
    setOpen(null);
  };

  if (journal.length === 0) return (
    <p className="text-center text-sm text-muted-foreground py-6">완료된 사이클이 없습니다.</p>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">매매일지</span>
        <button onClick={() => { setJournal(sym, []); setPage(1); setOpen(null); setTick(t => t + 1); }} className="text-xs text-muted-foreground hover:text-destructive transition-colors">전체 삭제</button>
      </div>
      {items.map((j, i) => {
        const origIdx = journal.length - 1 - ((page - 1) * PAGE_SZ + i);
        const dispNum = journal.length - ((page - 1) * PAGE_SZ + i);
        const isOpen = open === i;
        const profitPos = j.profit >= 0;
        const profitStr = `${profitPos ? '+' : ''}${f(j.profit)} (${j.profitPct.toFixed(2)}%)`;
        return (
          <div key={i} className="bg-muted/30 border border-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-sm font-semibold text-primary">#{dispNum}</span>
                <span className="text-xs text-muted-foreground truncate">{j.div}분할 · {j.startDate} ~ {j.endDate}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`font-mono text-sm font-semibold ${profitPos ? 'text-chart-2' : 'text-destructive'}`}>{profitStr}</span>
                <span className={`text-xs text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border px-3 py-2.5 bg-card flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground text-xs">시작 자본</span><span className="font-mono">{f(j.startRem)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground text-xs">종료 자본</span><span className="font-mono">{f(j.endRem)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground text-xs">사이클 수익</span><span className={`font-mono font-semibold ${profitPos ? 'text-chart-2' : 'text-destructive'}`}>{profitStr}</span></div>
                {j.trades && j.trades.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">체결 내역</span>
                    {j.trades.map((t, ti) => {
                      const typeLabel = t.type === 'buy' ? '매수' : t.type === 'quarter' ? '쿼터매도' : t.type === 'all' ? '지정가매도' : t.type === 'rbuy' ? '리버스매수' : '리버스매도';
                      const isSell = t.type === 'quarter' || t.type === 'all' || t.type === 'rsell';
                      return (
                        <div key={ti} className="flex items-center justify-between text-xs py-0.5 border-b border-border/40 last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-muted-foreground w-14 shrink-0">{t.date}</span>
                            <span className={`font-medium w-16 shrink-0 ${isSell ? 'text-chart-2' : 'text-foreground'}`}>{typeLabel}</span>
                            <span className="text-muted-foreground font-mono">{t.shares}{conf(sym).unit} × {f(t.price, 2)}</span>
                          </div>
                          <span className={`font-mono font-medium shrink-0 ${isSell ? 'text-chart-2' : 'text-foreground'}`}>{isSell ? '+' : '-'}{f(t.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button onClick={() => del(origIdx)} className="self-end text-xs text-muted-foreground hover:text-destructive transition-colors mt-1">삭제</button>
              </div>
            )}
          </div>
        );
      })}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-1">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">◀ 이전</button>
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">다음 ▶</button>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────

export default function QuantApp({ sym }: { sym: Symbol }) {
  const [tab, setTab] = useState<TabName>('buy');
  const [tdelta, setTdelta] = useState(1.0);
  const [tick, setTick] = useState(0); // 리렌더 트리거
  const [showReset, setShowReset] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [resetCapital, setResetCapital] = useState('');
  const [resetDiv, setResetDiv] = useState<10 | 20 | 40>(40);
  const [pendingProfit, setPendingProfit] = useState(0);

  // 입력 필드
  const [buyQty, setBuyQty] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);
  const [sellPrice, setSellPrice] = useState('');
  const [revBuyAmt, setRevBuyAmt] = useState('');
  const [revBuyPrice, setRevBuyPrice] = useState('');
  const [revByeol, setRevByeol] = useState('');
  const [revByeolLoading, setRevByeolLoading] = useState(false);
  const [revSellPriceVal, setRevSellPriceVal] = useState('');
  const [revExitPrice, setRevExitPrice] = useState('');
  const [setRem, setSetRem] = useState('');
  const [setCapital, setSetCapital] = useState('');
  const [setTotal, setSetTotal] = useState('');
  const [lastQuarterProceeds, setLastQuarterProceeds] = useState(0);
  const [setDiv, setSetDiv] = useState<10 | 20 | 40>(40);

  const [mounted, setMounted] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'ok' | 'error' | 'empty'>('idle');
  const [orderDraft, setOrderDraft] = useState<{
    label: string; side: 'BUY' | 'SELL'; orderType: 'LIMIT'; timeInForce?: 'CLS';
    price: string; quantity: string; clientOrderId: string;
    maxQty: number; allocAmt?: number;
  } | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderStatus, setOrderStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [orderErrMsg, setOrderErrMsg] = useState('');
  useEffect(() => {
    setMounted(true);
    setLastQuarterProceeds(getLastQP(sym));
    // 백그라운드에서 Supabase 동기화 후 리렌더
    syncFromSupabase().then(() => setTick(t => t + 1));
  }, []);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  // tick은 리렌더 트리거용
  void tick;
  const s = mounted ? getState(sym) : null;
  const hasPos = !!s && s.avg > 0 && s.shares > 0;
  const isReverse = s?.mode === 'reverse';
  const cur = conf(sym).currency;
  const f = (n: number | null | undefined, d = 2) => fmt(n, d, cur);
  const fmtOrderPrice = (price: number) => {
    if (cur === 'KRW') {
      const tick = conf(sym).tick; // 호가단위 (HYNIX2X = 5)
      return String(Math.floor(price / tick) * tick);
    }
    return price.toFixed(2);
  };
  const unit = cur === 'KRW' ? '원' : '달러';

  // 권장 수량 계산
  const nb = s ? nextAmt(s.rem, s.div, s.T) : 0;
  const recAmt = tdelta === 0.5 ? nb / 2 : nb;
  const buyPriceNum = parseFloat(buyPrice);
  const recQty = buyPriceNum > 0 && nb > 0 ? qtyFloor(recAmt / buyPriceNum, sym) : 0;
  // 첫 진입: 포지션 없지만 현재가 입력됨 → 주문 버튼 표시
  const isFirst = !!s && s.shares === 0 && s.avg === 0 && buyPriceNum > 0 && sym !== 'BTC';

  const handleInit = useCallback((capital: number, division: 10 | 20 | 40) => {
    setState(sym, defState(capital, division));
    setHist(sym, []);
    setLastQuarterProceeds(0);
    refresh();
  }, [sym, refresh]);

  const handleUndo = useCallback(() => {
    const stack = getUndo(sym);
    if (!stack.length) return;
    const { state, histLen } = stack.pop()!;
    setUndo(sym, stack);
    setState(sym, state);
    const hist = getHist(sym);
    setHist(sym, hist.slice(0, histLen));
    refresh();
  }, [sym, refresh]);

  const handleBuy = useCallback(() => {
    const qty = parseFloat(buyQty);
    const price = parseFloat(buyPrice);
    if (!qty || qty <= 0) return alert('매수 수량을 입력하세요.');
    if (!price || price <= 0) return alert('매수가를 입력하세요.');
    const amount = qty * price;
    const cur = getState(sym) ?? defState();
    if (amount > cur.rem) return alert(`매수 금액(${fmt(amount, 2, conf(sym).currency)})이 잔여자본(${fmt(cur.rem, 2, conf(sym).currency)})을 초과합니다.`);
    if (nb > 0) {
      // 권장 초과 시 차단하지 않음 — UI에서 안내만 표시
    }
    saveSnapshot(sym);
    const s = { ...cur };
    if (s.T === 0 && s.shares === 0 && !s.cycleStartDate) s.cycleStartDate = new Date().toLocaleDateString('ko');
    s.avg    = s.shares > 0 ? newAvg(s.avg, s.shares, price, qty) : price;
    s.shares = parseFloat((s.shares + qty).toFixed(6));
    s.rem   -= amount;
    s.T      = parseFloat((s.T + tdelta).toFixed(4));
    if (s.mode === 'normal' && shouldEnterReverse(s.T, s.div)) {
      s.mode = 'reverse'; s.reverseDay = 0;
      alert(`T값(${s.T.toFixed(2)})이 ${s.div - 1}을 초과했습니다.\n리버스모드로 진입합니다.`);
    }
    setState(sym, s);
    const hist = getHist(sym);
    hist.push({ type: 'buy', shares: qty, price, amount, T: s.T, date: new Date().toLocaleDateString('ko') });
    setHist(sym, hist);
    setBuyQty(''); setBuyPrice('');
    refresh();
  }, [sym, buyQty, buyPrice, tdelta, nb, recQty, refresh]);

  const handleSell = useCallback((type: 'quarter' | 'all') => {
    const cur = getState(sym);
    if (!cur || !cur.avg || cur.shares <= 0) return alert('보유 포지션이 없습니다.');
    saveSnapshot(sym);
    const inputPrice = parseFloat(sellPrice);
    const price = inputPrice > 0 ? inputPrice
      : type === 'quarter' ? bPrice(cur.avg, sym, cur.div, cur.T) : ftPrice(cur.avg, sym);
    const hist = getHist(sym);
    if (type === 'quarter') {
      const sell = qtyFloor(cur.shares * 0.25, sym);
      if (sell <= 0) return alert('보유 수량이 너무 적어 쿼터매도가 불가능합니다.');
      const s = { ...cur, shares: parseFloat((cur.shares - sell).toFixed(6)), T: parseFloat((cur.T * 0.75).toFixed(4)) };
      setState(sym, s);
      hist.push({ type: 'quarter', shares: sell, price, amount: sell * price, T: s.T, date: new Date().toLocaleDateString('ko') });
      setHist(sym, hist);
      setLastQuarterProceeds(sell * price);
      setLastQP(sym, sell * price);
    } else {
      const quarterProceeds = hist.filter(h => h.type === 'quarter').reduce((sum, h) => sum + h.amount, 0);
      const nextRem = cur.rem + cur.shares * price;
      const journalEndRem = nextRem + quarterProceeds;
      const startRem = cur.cycleStartRem ?? nextRem;
      const journalProfit = journalEndRem - startRem;
      const journalProfitPct = startRem > 0 ? journalProfit / startRem * 100 : 0;
      const journal = getJournal(sym);
      const cycleHist = [...hist, { type: 'all' as const, shares: cur.shares, price, amount: cur.shares * price, T: cur.T, date: new Date().toLocaleDateString('ko') }];
      journal.push({ cycle: cur.cycle ?? 1, div: cur.div, startRem, endRem: journalEndRem, profit: journalProfit, profitPct: journalProfitPct, startDate: cur.cycleStartDate ?? '—', endDate: new Date().toLocaleDateString('ko'), trades: cycleHist });
      setJournal(sym, journal);
      setHist(sym, []);
      const newS = { ...cur, rem: nextRem, total: nextRem, cycle: (cur.cycle ?? 1) + 1, cycleStartRem: nextRem, cycleStartDate: null, shares: 0, T: 0, avg: 0, mode: 'normal' as const, reverseDay: 0 };
      setState(sym, newS);
      setPendingProfit(journalProfit);
      setResetCapital(journalEndRem.toFixed(2));
      setResetDiv(cur.div);
      setSellPrice('');
      setShowReset(true);
      refresh();
      return;
    }
    setSellPrice('');
    refresh();
  }, [sym, sellPrice, refresh]);

  const handleResetConfirm = useCallback(() => {
    const capital = parseFloat(resetCapital) || 10000;
    const cur = getState(sym) ?? {};
    const newState = defState(capital, resetDiv);
    newState.cycle = (cur as SymbolState).cycle ?? 1;
    setState(sym, newState);
    setHist(sym, []);
    setShowReset(false);
    setTab('buy');
    refresh();
  }, [sym, resetCapital, resetDiv, refresh]);

  const handleReverseSell = useCallback(() => {
    const cur = getState(sym);
    if (!cur || cur.shares <= 0) return alert('보유 포지션이 없습니다.');
    const qty = revSellQty(cur.shares, cur.div, sym);
    if (qty <= 0) return alert('매도 가능 수량이 없습니다.');
    const byeolVal = parseFloat(revByeol);
    const priceVal = parseFloat(revSellPriceVal);
    const price = priceVal > 0 ? priceVal : byeolVal > 0 ? byeolVal : null;
    if (!price) return alert('매도가 또는 5거래일 평균을 입력하세요.');
    saveSnapshot(sym);
    const s = { ...cur };
    s.shares = parseFloat((s.shares - qty).toFixed(6));
    s.rem += qty * price;
    s.T = revTSell(s.T, s.div);
    s.reverseDay = (s.reverseDay ?? 0) + 1;
    setState(sym, s);
    const hist = getHist(sym);
    hist.push({ type: 'rsell', shares: qty, price, amount: qty * price, T: s.T, date: new Date().toLocaleDateString('ko') });
    setHist(sym, hist);
    setRevByeol(''); setRevSellPriceVal('');
    refresh();
  }, [sym, revByeol, revSellPriceVal, refresh]);

  const handleReverseBuy = useCallback(() => {
    const cur = getState(sym);
    if (!cur) return;
    const amtVal = parseFloat(revBuyAmt);
    const amount = amtVal > 0 ? amtVal : cur.rem / 4;
    const price = parseFloat(revBuyPrice);
    if (!price || price <= 0) return alert('매수가를 입력하세요.');
    const qty = qtyFloor(amount / price, sym);
    if (qty <= 0) return alert('매수 금액이 너무 작습니다.');
    const actualAmount = qty * price;
    saveSnapshot(sym);
    const s = { ...cur };
    s.avg = s.shares > 0 ? newAvg(s.avg, s.shares, price, qty) : price;
    s.shares = parseFloat((s.shares + qty).toFixed(6));
    s.rem -= actualAmount;
    s.T = revTBuy(s.T, s.div);
    setState(sym, s);
    const hist = getHist(sym);
    hist.push({ type: 'rbuy', shares: qty, price, amount: actualAmount, T: s.T, date: new Date().toLocaleDateString('ko') });
    setHist(sym, hist);
    setRevBuyAmt(''); setRevBuyPrice('');
    refresh();
  }, [sym, revBuyAmt, revBuyPrice, refresh]);

  const handleSyncHoldings = useCallback(async () => {
    const cur = getState(sym);
    if (!cur) return;
    setSyncLoading(true);
    setSyncStatus('idle');
    try {
      const res = await fetch(`/api/toss/holdings?symbol=${sym}`);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? `HTTP ${res.status}`); }
      const data: { quantity: number; averagePurchasePrice: number } = await res.json();
      if (data.quantity === 0) { setSyncStatus('empty'); return; }
      saveSnapshot(sym);
      setState(sym, { ...cur, shares: data.quantity, avg: data.averagePurchasePrice });
      setSyncStatus('ok');
      refresh();
    } catch (e) {
      setSyncStatus('error');
    } finally {
      setSyncLoading(false);
    }
  }, [sym, refresh]);

  const sendOrder = useCallback(async () => {
    if (!orderDraft) return;
    setOrderLoading(true);
    setOrderStatus('idle');
    try {
      const res = await fetch('/api/toss/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym, ...orderDraft }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setOrderStatus('ok');
      setTimeout(() => { setOrderDraft(null); setOrderStatus('idle'); }, 2000);
    } catch (e) {
      setOrderStatus('error');
      setOrderErrMsg(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setOrderLoading(false);
    }
  }, [orderDraft, sym]);

  const openBuyLocOrder = () => {
    if (!s || (!hasPos && !isFirst)) return;
    let orderPrice: number, locAmt: number, label: string;
    if (isFirst) {
      orderPrice = buyPriceNum;
      locAmt = nb;
      label = '현재가 LOC 매수';
    } else {
      const bpr = bPrice(s.avg, sym, s.div, s.T);
      orderPrice = bpr - conf(sym).tick;
      if (orderPrice <= 0) return alert('별지점 가격을 계산할 수 없습니다.');
      const isSecHalf = s.T >= s.div / 2;
      locAmt = isSecHalf ? nb : nb / 2;
      label = '별지점 LOC 매수';
    }
    const maxQty = qtyFloor(locAmt / orderPrice, sym);
    const qty = recQty > 0 ? recQty : maxQty > 0 ? maxQty : 1;
    const d = new Date().toISOString().slice(0, 10);
    setOrderDraft({ label, side: 'BUY', orderType: 'LIMIT', timeInForce: 'CLS', price: fmtOrderPrice(orderPrice), quantity: String(qty), clientOrderId: `${sym}-BUY-BYEOL-${d}`, maxQty, allocAmt: locAmt });
  };

  const openAvgLocOrder = () => {
    if (!s || !hasPos) return;
    const avgPt = s.avg - conf(sym).tick;
    if (avgPt <= 0) return alert('평단가를 계산할 수 없습니다.');
    const allocAmt = nb / 2;
    const maxQty = qtyFloor(allocAmt / avgPt, sym);
    const qty = recQty > 0 ? recQty : maxQty > 0 ? maxQty : 1;
    const d = new Date().toISOString().slice(0, 10);
    setOrderDraft({ label: '평단가 LOC 매수', side: 'BUY', orderType: 'LIMIT', timeInForce: 'CLS', price: fmtOrderPrice(avgPt), quantity: String(qty), clientOrderId: `${sym}-BUY-AVG-${d}`, maxQty, allocAmt });
  };

  const openBuyLimitOrder = () => {
    if (!s || (!hasPos && !isFirst)) return;
    let orderPrice: number, locAmt: number, label: string;
    if (isFirst) {
      orderPrice = buyPriceNum;
      locAmt = nb;
      label = '현재가 지정가 매수';
    } else {
      const bpr = bPrice(s.avg, sym, s.div, s.T);
      orderPrice = bpr - conf(sym).tick;
      if (orderPrice <= 0) return alert('별지점 가격을 계산할 수 없습니다.');
      const isSecHalf = s.T >= s.div / 2;
      locAmt = isSecHalf ? nb : nb / 2;
      label = '별지점 지정가 매수';
    }
    const maxQty = qtyFloor(locAmt / orderPrice, sym);
    const qty = recQty > 0 ? recQty : maxQty > 0 ? maxQty : 1;
    const d = new Date().toISOString().slice(0, 10);
    setOrderDraft({ label, side: 'BUY', orderType: 'LIMIT', price: fmtOrderPrice(orderPrice), quantity: String(qty), clientOrderId: `${sym}-BUY-LIMIT-BYEOL-${d}`, maxQty, allocAmt: locAmt });
  };

  const openAvgLimitOrder = () => {
    if (!s || !hasPos) return;
    const avgPt = s.avg - conf(sym).tick;
    if (avgPt <= 0) return alert('평단가를 계산할 수 없습니다.');
    const allocAmt = nb / 2;
    const maxQty = qtyFloor(allocAmt / avgPt, sym);
    const qty = recQty > 0 ? recQty : maxQty > 0 ? maxQty : 1;
    const d = new Date().toISOString().slice(0, 10);
    setOrderDraft({ label: '평단가 지정가 매수', side: 'BUY', orderType: 'LIMIT', price: fmtOrderPrice(avgPt), quantity: String(qty), clientOrderId: `${sym}-BUY-LIMIT-AVG-${d}`, maxQty, allocAmt });
  };

  const openQuarterSellOrder = () => {
    if (!s || !hasPos) return;
    const price = bPrice(s.avg, sym, s.div, s.T);
    const maxQty = qtyFloor(s.shares * 0.25, sym);
    if (maxQty <= 0) return alert('보유 수량이 너무 적습니다.');
    const d = new Date().toISOString().slice(0, 10);
    setOrderDraft({ label: '쿼터매도 주문 (¼)', side: 'SELL', orderType: 'LIMIT', price: fmtOrderPrice(price), quantity: String(maxQty), clientOrderId: `${sym}-SELL-QUARTER-${d}`, maxQty });
  };

  const openLimitSellOrder = () => {
    if (!s || !hasPos) return;
    const price = ftPrice(s.avg, sym);
    const quarterQty = qtyFloor(s.shares * 0.25, sym);
    const maxQty = parseFloat((s.shares - quarterQty).toFixed(6));
    if (maxQty <= 0) return alert('보유 수량이 너무 적습니다.');
    const d = new Date().toISOString().slice(0, 10);
    setOrderDraft({ label: '지정가매도 주문 (¾)', side: 'SELL', orderType: 'LIMIT', price: fmtOrderPrice(price), quantity: String(maxQty), clientOrderId: `${sym}-SELL-LIMIT-${d}`, maxQty });
  };

  const checkRevExit = useCallback(() => {
    const cur = getState(sym);
    if (!cur) return null;
    const v = parseFloat(revExitPrice);
    if (!v || !cur.avg) return null;
    const threshold = cur.avg * (1 - conf(sym).target_pct / 100);
    return v > threshold;
  }, [sym, revExitPrice]);

  const exitReverseMode = useCallback(() => {
    const cur = getState(sym);
    if (!cur) return;
    saveSnapshot(sym);
    setState(sym, { ...cur, mode: 'normal', reverseDay: 0 });
    setRevExitPrice('');
    refresh();
  }, [sym, refresh]);

  if (!s) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <h2 className="text-base font-semibold mb-2">시작 전 설정</h2>
        <p className="text-sm text-muted-foreground mb-6">투자할 총 자본과 분할 수를 입력하세요.<br />나중에 언제든지 바꿀 수 있습니다.</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs text-muted-foreground">총 자본 ({unit})</label>
            <input id="ob-capital" type="number" defaultValue="10000" className="bg-input border border-border rounded px-3 py-2 text-sm font-mono w-40 outline-none focus:border-ring" />
          </div>
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs text-muted-foreground">분할 수</label>
            <select id="ob-division" className="bg-input border border-border rounded px-3 py-2 text-sm w-40 outline-none focus:border-ring">
              {sym === 'BTC' && <option value="10">10분할 — BTC형</option>}
              <option value="40">40분할 — 안정형</option>
              <option value="20">20분할 — 공격형</option>
            </select>
          </div>
          <button
            onClick={() => {
              const cap = parseFloat((document.getElementById('ob-capital') as HTMLInputElement).value) || 10000;
              const div = parseInt((document.getElementById('ob-division') as HTMLSelectElement).value) as 10 | 20 | 40 || 40;
              handleInit(cap, div);
            }}
            className="self-end bg-primary text-primary-foreground px-5 py-2 rounded text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            시작하기
          </button>
        </div>
      </div>
    );
  }

  const revExitOk = checkRevExit();

  return (
    <div className="flex flex-col gap-3">
      <StatusBar s={s} sym={sym} />

      {/* 리버스 배너 */}
      {isReverse && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-destructive">리버스모드 진행 중</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.reverseDay === 0 ? 'D1 · 오늘: MOC 매도 (무조건), 매수 없음' : `D${s.reverseDay + 1} · 오늘: 별지점 위 LOC 매도 + 잔금/4 매수`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">종가 입력 (복귀 확인)</span>
              <input type="number" value={revExitPrice} onChange={e => setRevExitPrice(e.target.value)}
                placeholder="종가" className="bg-input border border-border rounded px-2 py-1 text-xs font-mono w-24 outline-none focus:border-ring" />
              {revExitPrice && (
                <span className={`text-xs font-mono ${revExitOk ? 'text-primary' : 'text-muted-foreground'}`}>
                  {revExitOk ? '✓ 복귀 가능' : '복귀 불가'}
                </span>
              )}
              {revExitOk && (
                <button onClick={exitReverseMode} className="bg-primary text-primary-foreground text-xs px-3 py-1 rounded font-semibold hover:opacity-90 transition-opacity">
                  일반모드 복귀
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <TargetCards s={s} sym={sym} revByeol={revByeol} />
      <LocGuide s={s} sym={sym} />

      {/* 액션 패널 */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex border-b border-border">
          {(['buy','sell','journal','setting'] as TabName[]).map((t, i) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {['① 매수','② 매도','③ 매매일지','④ 설정'][i]}
            </button>
          ))}
        </div>
        <div className="p-4">
          {/* 매수 탭 */}
          {tab === 'buy' && !isReverse && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">매수 수량 ({conf(sym).unit})</label>
                  <input type="number" value={buyQty} onChange={e => setBuyQty(e.target.value)}
                    placeholder={sym === 'BTC' ? '예: 0.001163' : '예: 3'} className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-muted-foreground">매수가 ({unit})</label>
                    {sym !== 'BTC' && (
                      <button
                        onClick={async () => {
                          setPriceLoading(true);
                          try {
                            const res = await fetch(`/api/toss/price?symbol=${sym}`);
                            const data = await res.json();
                            if (data.price) {
                              const rawPrice = conf(sym).currency === 'KRW' ? String(Math.round(parseFloat(data.price))) : data.price;
                              setBuyPrice(rawPrice);
                              const price = parseFloat(data.price);
                              if (price > 0 && nb > 0) {
                                const auto = qtyFloor(recAmt / price, sym);
                                if (auto > 0) setBuyQty(String(auto));
                              }
                            }
                          } catch {
                            // 조용히 실패
                          } finally {
                            setPriceLoading(false);
                          }
                        }}
                        disabled={priceLoading}
                        className="text-xs text-primary hover:underline disabled:opacity-40"
                      >
                        {priceLoading ? '조회 중...' : '현재가'}
                      </button>
                    )}
                  </div>
                  <input type="number" value={buyPrice} onChange={e => {
                    const p = e.target.value;
                    setBuyPrice(p);
                    const price = parseFloat(p);
                    if (price > 0 && nb > 0) {
                      const auto = qtyFloor(recAmt / price, sym);
                      if (auto > 0) setBuyQty(String(auto));
                    }
                  }}
                    placeholder="예: 73.05" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
              </div>
              {buyPriceNum > 0 && nb > 0 && (
                <p className="text-xs text-muted-foreground font-mono">
                  권장: {f(recAmt)}{recQty > 0 ? ` ≈ ${recQty}${conf(sym).unit}` : ' (최소 단위 미만)'}
                  {tdelta === 0.5 ? ` · 1회매수금 ${f(nb)}의 절반` : ''}
                </p>
              )}
              {recQty > 0 && parseFloat(buyQty) > recQty && (
                <p className="text-xs text-amber-500">권장 수량({recQty}{conf(sym).unit})을 초과했습니다. T값이 예상보다 빠르게 증가합니다.</p>
              )}
              {sym !== 'BTC' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">체결 유형</p>
                  <div className="flex gap-2">
                    {([1.0, 0.5] as const).map(v => (
                      <button key={v} onClick={() => setTdelta(v)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-colors ${tdelta === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                        {v === 1.0 ? '전체 체결 (T +1)' : '절반 체결 (T +0.5)'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {sym === 'BTC'
                  ? '별지점 이하인 날 매수 후 체결가를 입력하세요. (T +1 고정)'
                  : '실제로 매수를 체결한 후, 체결 금액과 체결가를 그대로 입력하세요.'}
              </p>
              {(hasPos || isFirst) && sym !== 'BTC' && (
                <div className="border-t border-border pt-3 flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">토스증권 주문 전송{isFirst ? ' — 첫 진입 (현재가 기준)' : ''}</p>
                  {cur === 'USD' && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground/60">LOC (장 마감 지정가)</p>
                      <div className="flex gap-2">
                        <button onClick={openBuyLocOrder} className="flex-1 border border-primary/50 text-primary py-2 rounded text-xs font-semibold hover:bg-primary/10 transition-colors">{isFirst ? '현재가 LOC' : '별지점 LOC'}</button>
                        {hasPos && s.T < s.div / 2 && (
                          <button onClick={openAvgLocOrder} className="flex-1 border border-border text-muted-foreground py-2 rounded text-xs font-semibold hover:bg-muted/50 transition-colors">평단가 LOC</button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-muted-foreground/60">지정가</p>
                    <div className="flex gap-2">
                      <button onClick={openBuyLimitOrder} className="flex-1 border border-primary/50 text-primary py-2 rounded text-xs font-semibold hover:bg-primary/10 transition-colors">{isFirst ? '현재가 지정가' : '별지점 지정가'}</button>
                      {hasPos && s.T < s.div / 2 && (
                        <button onClick={openAvgLimitOrder} className="flex-1 border border-border text-muted-foreground py-2 rounded text-xs font-semibold hover:bg-muted/50 transition-colors">평단가 지정가</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <button onClick={handleBuy} className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">매수 기록하기</button>
            </div>
          )}
          {tab === 'buy' && isReverse && (
            <div className="flex flex-col gap-4">
              <div className="bg-muted/40 border border-border rounded p-3 text-sm flex justify-between">
                <span className="text-xs text-muted-foreground">오늘 매수금액 (잔금 ÷ 4)</span>
                <span className="font-mono">{s.reverseDay > 0 ? f(s.rem / 4) : '첫날 매수 없음'}</span>
              </div>
              {s.reverseDay > 0 && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-muted-foreground">별지점 — 5일 평균 종가 ({unit})</label>
                      {sym !== 'BTC' && (
                        <button
                          onClick={() => {
                            setRevByeolLoading(true);
                            fetch(`/api/toss/candles?symbol=${sym}`)
                              .then(r => r.json())
                              .then(d => { if (d.avg) setRevByeol(d.avg); })
                              .catch(() => {})
                              .finally(() => setRevByeolLoading(false));
                          }}
                          disabled={revByeolLoading}
                          className="text-xs text-primary hover:underline disabled:opacity-40"
                        >
                          {revByeolLoading ? '조회 중...' : '5일평균'}
                        </button>
                      )}
                    </div>
                    <input type="number" value={revByeol} onChange={e => setRevByeol(e.target.value)}
                      placeholder="예: 35.00" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                    {revByeol && parseFloat(revByeol) > 0 && (() => {
                      const byeolNum = parseFloat(revByeol);
                      const amt = parseFloat(revBuyAmt) > 0 ? parseFloat(revBuyAmt) : s.rem / 4;
                      const orderQty = qtyFloor(amt / byeolNum, sym);
                      return (
                        <p className="text-xs text-primary font-mono mt-1.5">
                          권장 주문 수량: {orderQty}{conf(sym).unit} ({sym === 'BTC' ? '지정가' : 'LOC'} — 별지점 아래 체결 시)
                        </p>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">실제 체결가 ({unit})</label>
                    <input type="number" value={revBuyPrice} onChange={e => setRevBuyPrice(e.target.value)}
                      placeholder="LOC 체결가" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                  </div>
                  <button onClick={handleReverseBuy} className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">리버스 매수 기록</button>
                </>
              )}
              {s.reverseDay === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">D1 첫날은 매수 없음</p>
              )}
            </div>
          )}

          {/* 매도 탭 */}
          {tab === 'sell' && !isReverse && (
            <div className="flex flex-col gap-4">
              <div className="bg-muted/40 border border-border rounded p-3 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-xs text-muted-foreground">쿼터매도 목표가</span>
                  <span className="font-mono">{hasPos ? f(bPrice(s.avg, sym, s.div, s.T)) : '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-xs text-muted-foreground">지정가매도 목표가 (잔여 ¾)</span>
                  <span className="font-mono">{hasPos ? f(ftPrice(s.avg, sym)) : '—'}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">실제 매도가 (비우면 목표가 자동 사용)</label>
                <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                  placeholder="비워두면 목표가 자동 사용" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
              </div>
              <p className="text-xs text-muted-foreground">목표가에 정확히 체결되지 않았다면 실제 체결가를 입력하세요.</p>
              {hasPos && sym !== 'BTC' && (
                <div className="border-t border-border pt-3 flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">토스증권 주문 전송</p>
                  <div className="flex gap-2">
                    <button onClick={openQuarterSellOrder} className="flex-1 border border-border text-muted-foreground py-2 rounded text-xs font-semibold hover:bg-muted/50 transition-colors">쿼터매도 주문</button>
                    <button onClick={openLimitSellOrder} className="flex-1 border border-primary/50 text-primary py-2 rounded text-xs font-semibold hover:bg-primary/10 transition-colors">지정가매도 주문</button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => handleSell('quarter')} className="flex-1 bg-secondary text-secondary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity border border-border">쿼터매도 (¼)</button>
                <button onClick={() => handleSell('all')} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">지정가매도 (¾)</button>
              </div>
            </div>
          )}
          {tab === 'sell' && isReverse && (
            <div className="flex flex-col gap-4">
              <div className="bg-muted/40 border border-border rounded p-3 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-xs text-muted-foreground">오늘 매도 수량</span>
                  <span className="font-mono">{hasPos ? `${revSellQty(s.shares, s.div, sym)}${conf(sym).unit}` : '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-xs text-muted-foreground">리버스 별지점 (5거래일 평균)</span>
                  <span className="font-mono">{revByeol ? f(parseFloat(revByeol)) : '입력 필요'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-muted-foreground">5일 평균 종가 (별지점)</label>
                    {sym !== 'BTC' && (
                      <button
                        onClick={() => {
                          setRevByeolLoading(true);
                          fetch(`/api/toss/candles?symbol=${sym}`)
                            .then(r => r.json())
                            .then(d => { if (d.avg) setRevByeol(d.avg); })
                            .catch(() => {})
                            .finally(() => setRevByeolLoading(false));
                        }}
                        disabled={revByeolLoading}
                        className="text-xs text-primary hover:underline disabled:opacity-40"
                      >
                        {revByeolLoading ? '조회 중...' : '5일평균'}
                      </button>
                    )}
                  </div>
                  <input type="number" value={revByeol} onChange={e => setRevByeol(e.target.value)}
                    placeholder="예: 35.00" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">실제 매도가 (비우면 별지점)</label>
                  <input type="number" value={revSellPriceVal} onChange={e => setRevSellPriceVal(e.target.value)}
                    placeholder="체결가 입력" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{s.reverseDay === 0 ? 'D1 첫날: MOC 무조건 매도 (별지점 무관)' : `D${s.reverseDay + 1}: 별지점 위 LOC 매도`}</p>
              <button onClick={handleReverseSell} className="bg-destructive text-destructive-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">리버스 매도 기록</button>
            </div>
          )}

          {/* 매매일지 탭 */}
          {tab === 'journal' && <JournalTab sym={sym} />}

          {/* 설정 탭 */}
          {tab === 'setting' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">총 자본 재설정 ({unit})</label>
                  <input type="number" value={setCapital} onChange={e => setSetCapital(e.target.value)}
                    placeholder="10000" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">분할 수 재설정</label>
                  <select value={setDiv} onChange={e => setSetDiv(parseInt(e.target.value) as 10 | 20 | 40)}
                    className="w-full bg-input border border-border rounded px-3 py-2 text-sm outline-none focus:border-ring">
                    {sym === 'BTC' && <option value="10">10분할 — BTC형</option>}
                    <option value="40">40분할 — 안정형</option>
                    <option value="20">20분할 — 공격형</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">⚠️ 초기화하면 현재 진행 중인 사이클과 거래 내역이 모두 삭제됩니다.</p>
              <button onClick={() => {
                const cap = parseFloat(setCapital) || 10000;
                if (!confirm(`${sym}을 초기화하시겠습니까?`)) return;
                setState(sym, defState(cap, setDiv));
                setHist(sym, []);
                setSetCapital('');
                setTab('buy');
                refresh();
              }} className="bg-secondary text-secondary-foreground border border-border py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">초기화 후 재시작</button>
              <div className="border-t border-border pt-4 flex flex-col gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">잔여자본 직접 수정 ({unit})</label>
                  {lastQuarterProceeds > 0 && (
                    <div className="mb-2 flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground">마지막 쿼터매도 수익: <span className="font-mono text-foreground">{f(lastQuarterProceeds)}</span> — 재투입 금액 선택</p>
                      <div className="flex gap-2">
                        {([25, 50, 100] as const).map(pct => {
                          const add = lastQuarterProceeds * pct / 100;
                          const cur = getState(sym);
                          return (
                            <button key={pct} onClick={() => { if (cur) { setSetRem(String(parseFloat((cur.rem + add).toFixed(2)))); setLastQuarterProceeds(0); setLastQP(sym, 0); } }}
                              className="flex-1 text-xs border border-border rounded py-1.5 hover:bg-accent transition-colors font-mono">
                              +{f(add)} ({pct}%)
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <input type="number" value={setRem} onChange={e => setSetRem(e.target.value)}
                    placeholder="실제 남은 현금 입력" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
                <p className="text-xs text-muted-foreground">T값·평단가·보유주식은 유지되고 잔여자본만 변경됩니다.</p>
                <button onClick={() => {
                  const val = parseFloat(setRem);
                  if (!val || val <= 0) return alert('올바른 금액을 입력하세요.');
                  const cur = getState(sym);
                  if (!cur) return;
                  setState(sym, { ...cur, rem: val });
                  setSetRem('');
                  refresh();
                  alert(`잔여자본이 ${f(val)}으로 수정되었습니다.`);
                }} className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">잔여자본 수정</button>
              </div>
              <div className="border-t border-border pt-4 flex flex-col gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">총 자본 직접 수정 ({unit})</label>
                  {(() => {
                    const cur = getState(sym);
                    if (!cur || !cur.shares || !cur.avg) return null;
                    const suggested = cur.rem + cur.shares * cur.avg;
                    return (
                      <p className="text-xs text-muted-foreground mb-2">
                        추정값: 잔여자본 + 보유{unit} × 평단가 = <button
                          className="font-mono text-foreground underline underline-offset-2 hover:opacity-70"
                          onClick={() => setSetTotal(suggested.toFixed(2))}
                        >{f(suggested)}</button>
                      </p>
                    );
                  })()}
                  <input type="number" value={setTotal} onChange={e => setSetTotal(e.target.value)}
                    placeholder="총 자본 입력" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
                <p className="text-xs text-muted-foreground">T값·평단가·잔여자본은 유지되고 총 자본 표시만 변경됩니다.</p>
                <button onClick={() => {
                  const val = parseFloat(setTotal);
                  if (!val || val <= 0) return alert('올바른 금액을 입력하세요.');
                  const cur = getState(sym);
                  if (!cur) return;
                  setState(sym, { ...cur, total: val });
                  setSetTotal('');
                  refresh();
                  alert(`총 자본이 ${f(val)}으로 수정되었습니다.`);
                }} className="bg-secondary text-secondary-foreground border border-border py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">총 자본 수정</button>
              </div>
              {sym !== 'BTC' && (
                <div className="border-t border-border pt-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">계좌 동기화</p>
                      <p className="text-xs text-muted-foreground">토스증권 계좌에서 보유수량·평단가를 불러옵니다</p>
                    </div>
                    <button onClick={handleSyncHoldings} disabled={syncLoading}
                      className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0">
                      {syncLoading ? '동기화 중...' : '계좌 동기화'}
                    </button>
                  </div>
                  {syncStatus === 'ok' && <p className="text-xs text-primary">동기화 완료 — 보유수량·평단가가 업데이트됐습니다. 되돌리기로 복원 가능합니다.</p>}
                  {syncStatus === 'empty' && <p className="text-xs text-muted-foreground">토스 계좌에 {sym} 보유 내역이 없습니다. 업데이트를 건너뜁니다.</p>}
                  {syncStatus === 'error' && <p className="text-xs text-destructive">동기화 실패 — 다시 시도하세요.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <TradeHistory sym={sym} onUndo={handleUndo} tab={tab} />

      {/* 주문 확인 모달 */}
      {orderDraft && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm flex flex-col gap-4">
            <div>
              <h3 className="text-base font-semibold">{orderDraft.label}</h3>
              <p className="text-xs text-destructive mt-1 font-semibold">실제 돈이 걸린 주문입니다. 확인 후 전송하세요.</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-lg divide-y divide-border text-sm">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-muted-foreground">심볼</span>
                <span className="font-mono font-semibold">{sym}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-muted-foreground">주문 유형</span>
                <span className="font-mono">{orderDraft.timeInForce === 'CLS' ? 'LOC (장 마감 지정가)' : '지정가'}</span>
              </div>
              <div className="flex flex-col px-4 py-2 gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">수량</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step={conf(sym).decimals ? Math.pow(10, -conf(sym).decimals) : 1}
                      value={orderDraft.quantity}
                      onChange={e => setOrderDraft(d => d ? { ...d, quantity: e.target.value } : null)}
                      className="w-24 bg-input border border-border rounded px-2 py-1 text-sm font-mono text-right outline-none focus:border-ring"
                    />
                    <span className="text-xs text-muted-foreground">{conf(sym).unit}</span>
                  </div>
                </div>
                {(() => {
                  const qty = parseFloat(orderDraft.quantity) || 0;
                  const price = parseFloat(orderDraft.price);
                  if (orderDraft.side === 'BUY' && orderDraft.allocAmt) {
                    const isLoc = orderDraft.timeInForce === 'CLS';
                    const cost = qty * price;
                    const isOver = !isLoc && qty > 0 && cost > orderDraft.allocAmt;
                    return (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground/60">배정금액</span>
                          <span className="text-xs text-muted-foreground/60">
                            {f(orderDraft.allocAmt)}{isLoc ? ' (LOC: 종가 체결)' : ''}
                          </span>
                        </div>
                        {isOver && (
                          <p className="text-xs text-destructive font-semibold">
                            배정금액 초과 — {qty}{conf(sym).unit} × {f(price)} = {f(cost)}
                          </p>
                        )}
                      </>
                    );
                  }
                  const qty2 = parseFloat(orderDraft.quantity) || 0;
                  return orderDraft.maxQty > 0 ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground/60">전략 한도</span>
                        <span className="text-xs text-muted-foreground/60">최대 {orderDraft.maxQty}{conf(sym).unit}</span>
                      </div>
                      {qty2 > orderDraft.maxQty && (
                        <p className="text-xs text-destructive font-semibold">
                          전략 한도 초과 — 최대 {orderDraft.maxQty}{conf(sym).unit}까지 권장됩니다
                        </p>
                      )}
                    </>
                  ) : null;
                })()}
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-muted-foreground">가격</span>
                <span className="font-mono font-semibold">{f(parseFloat(orderDraft.price))}</span>
              </div>
            </div>
            {orderStatus === 'ok' && <p className="text-sm text-primary text-center font-semibold">주문이 전송되었습니다.</p>}
            {orderStatus === 'error' && <p className="text-sm text-destructive text-center">{orderErrMsg}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setOrderDraft(null); setOrderStatus('idle'); }}
                disabled={orderLoading}
                className="flex-1 border border-border py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >취소</button>
              <button
                onClick={sendOrder}
                disabled={orderLoading || orderStatus === 'ok'}
                className="flex-1 bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >{orderLoading ? '전송 중...' : '주문 전송'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 사이클 완료 모달 */}
      {showReset && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm flex flex-col gap-4">
            <div>
              <h3 className="text-base font-semibold">사이클 완료</h3>
              <p className="text-sm text-muted-foreground mt-1">
                손익: <span className={`font-mono font-semibold ${pendingProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {pendingProfit >= 0 ? '+' : ''}{f(pendingProfit)}
                </span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">다음 사이클의 자본과 분할 수를 확인하고 시작하세요.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">총 자본</label>
                <input type="number" value={resetCapital} onChange={e => setResetCapital(e.target.value)}
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">분할 수</label>
                <select value={resetDiv} onChange={e => setResetDiv(parseInt(e.target.value) as 10 | 20 | 40)}
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm outline-none focus:border-ring">
                  {sym === 'BTC' && <option value="10">10분할 — BTC형</option>}
                  <option value="40">40분할 — 안정형</option>
                  <option value="20">20분할 — 공격형</option>
                </select>
              </div>
            </div>
            <button onClick={handleResetConfirm} className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">다음 사이클 시작</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { QuantApp };
export type { Symbol };

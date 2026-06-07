'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Symbol, TabName, SymbolState, HistoryEntry, JournalEntry } from '@/lib/types';
import { defState, bPct, bPrice, ftPrice, nextAmt, newAvg, revTSell, revTBuy, revSellQty, shouldEnterReverse, fmt, conf } from '@/lib/calc';
import { getState, setState, getHist, setHist, getJournal, setJournal, getUndo, setUndo, saveSnapshot, syncFromSupabase } from '@/lib/storage';

// ── 서브 컴포넌트 ──────────────────────────────────────────────────────────

function StatusBar({ s }: { s: SymbolState }) {
  const isReverse = s.mode === 'reverse';
  const pct = Math.min(s.T / s.div * 100, 100);
  const hasPos = s.avg > 0 && s.shares > 0;
  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <div className="p-3 border-r border-b sm:border-b-0 border-border">
          <p className="text-xs text-muted-foreground mb-1">평단가</p>
          <p className="font-mono text-sm font-semibold">{hasPos ? fmt(s.avg) : '—'}</p>
        </div>
        <div className="p-3 border-b sm:border-b-0 sm:border-r border-border">
          <p className="text-xs text-muted-foreground mb-1">보유주식</p>
          <p className="font-mono text-sm font-semibold">{hasPos ? `${s.shares.toFixed(4)}주` : '—'}</p>
        </div>
        <div className="p-3 border-r border-border">
          <p className="text-xs text-muted-foreground mb-1">총 자본</p>
          <p className="font-mono text-sm font-semibold text-muted-foreground">{fmt(s.total ?? s.rem)}</p>
        </div>
        <div className="p-3">
          <p className="text-xs text-muted-foreground mb-1">잔여자본</p>
          <p className="font-mono text-sm font-semibold text-muted-foreground">{fmt(s.rem)}</p>
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

function TargetCards({ s, sym }: { s: SymbolState; sym: Symbol }) {
  const hasPos = s.avg > 0 && s.shares > 0;
  const isReverse = s.mode === 'reverse';

  if (isReverse) {
    const qty = hasPos ? revSellQty(s.shares, s.div) : 0;
    const rdAmt = s.reverseDay > 0 ? s.rem / 4 : 0;
    return (
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-destructive/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">오늘 매도 수량</p>
          <p className="font-mono text-xl font-bold text-destructive">{hasPos ? `${qty}주` : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{hasPos ? `${s.shares.toFixed(4)}주 ÷ ${s.div}` : '—'}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">리버스 별지점</p>
          <p className="font-mono text-xl font-bold">직접 입력</p>
          <p className="text-xs text-muted-foreground mt-1">5거래일 종가 평균</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">오늘 매수금액</p>
          <p className="font-mono text-xl font-bold">{s.reverseDay > 0 ? fmt(rdAmt) : '없음 (D1)'}</p>
          <p className="text-xs text-muted-foreground mt-1">{s.reverseDay > 0 ? `${fmt(s.rem)} ÷ 4` : '첫날은 매도만'}</p>
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
          <p className="font-mono text-xl font-bold">{fmt(nb)}</p>
          <p className="text-xs text-muted-foreground mt-1">{fmt(s.rem)} ÷ {s.div}</p>
        </div>
      </div>
    );
  }

  const bp = bPct(sym, s.div, s.T);
  const bpr = bPrice(s.avg, sym, s.div, s.T);
  const buyPt = parseFloat((bpr - 0.01).toFixed(2));
  const ft = ftPrice(s.avg, sym);
  const nb = nextAmt(s.rem, s.div, s.T);
  const isNeg = bp < 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className={`bg-card border rounded-lg p-3 ${isNeg ? 'border-destructive/40' : 'border-primary/40'}`}>
        <p className="text-xs text-muted-foreground mb-2">별지점 (쿼터매도)</p>
        <p className={`font-mono text-xl font-bold ${isNeg ? 'text-destructive' : 'text-primary'}`}>{fmt(bpr)}</p>
        <p className={`text-xs mt-1 ${isNeg ? 'text-destructive' : 'text-muted-foreground'}`}>
          평단 대비 {bp >= 0 ? '+' : ''}{bp.toFixed(2)}%
        </p>
        <p className="text-xs text-muted-foreground/50 mt-0.5">매수점: {fmt(buyPt)}</p>
      </div>
      <div className="bg-card border border-chart-1/40 rounded-lg p-3">
        <p className="text-xs text-muted-foreground mb-2">지정가 목표 (잔여 ¾)</p>
        <p className="font-mono text-xl font-bold text-chart-1">{fmt(ft)}</p>
        <p className="text-xs text-muted-foreground mt-1">평단 대비 +{conf(sym).target_pct}%</p>
      </div>
      <div className="bg-card border border-border rounded-lg p-3">
        <p className="text-xs text-muted-foreground mb-2">오늘 매수금액</p>
        <p className="font-mono text-xl font-bold">{nb > 0 ? fmt(nb) : '소진'}</p>
        <p className="text-xs text-muted-foreground mt-1">{nb > 0 ? `${s.div}분할 ${Math.floor(s.T) + 1}회차` : '리버스 대기'}</p>
      </div>
    </div>
  );
}

function LocGuide({ s, sym }: { s: SymbolState; sym: Symbol }) {
  if (s.mode === 'reverse' || !(s.avg > 0 && s.shares > 0)) return null;
  const bp = bPct(sym, s.div, s.T);
  const bpr = bPrice(s.avg, sym, s.div, s.T);
  const buyPt = parseFloat((bpr - 0.01).toFixed(2));
  const nb = nextAmt(s.rem, s.div, s.T);
  const half = nb / 2;
  const avgPt = parseFloat((s.avg - 0.01).toFixed(2));
  const isSecondHalf = s.T >= s.div / 2;
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/40">
        <p className="text-xs text-muted-foreground">
          오늘 LOC 매수 방법 · <span className="text-foreground font-medium">{isSecondHalf ? '후반전' : '전반전'}</span>
        </p>
      </div>
      <div className="divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold bg-primary/15 text-primary px-2 py-0.5 rounded">별지점</span>
            <div>
              <p className="font-mono text-sm font-semibold">{fmt(buyPt)} 이하 LOC</p>
              <p className="text-xs text-muted-foreground">별지점 {fmt(bpr)} − $0.01{bp < 0 ? ' · 평단 아래' : ''}</p>
            </div>
          </div>
          <span className="font-mono text-sm font-semibold text-primary">{fmt(isSecondHalf ? nb : half)}</span>
        </div>
        {!isSecondHalf && (
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded">평단가</span>
              <div>
                <p className="font-mono text-sm font-semibold">{fmt(avgPt)} 이하 LOC</p>
                <p className="text-xs text-muted-foreground">평단 {fmt(s.avg)} − $0.01</p>
              </div>
            </div>
            <span className="font-mono text-sm font-semibold text-primary">{fmt(half)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TradeHistory({ sym, onUndo }: { sym: Symbol; onUndo: () => void }) {
  const hist = getHist(sym);
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
          <button onClick={() => { setHist(sym, []); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">전체 삭제</button>
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
                <span className="font-mono text-xs">{h.shares.toFixed(4)}주 @ {fmt(h.price)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs">{fmt(h.amount)}</span>
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
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
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
        <button onClick={() => { setJournal(sym, []); setPage(1); setOpen(null); }} className="text-xs text-muted-foreground hover:text-destructive transition-colors">전체 삭제</button>
      </div>
      {items.map((j, i) => {
        const origIdx = journal.length - 1 - ((page - 1) * PAGE_SZ + i);
        const dispNum = journal.length - ((page - 1) * PAGE_SZ + i);
        const isOpen = open === i;
        const profitPos = j.profit >= 0;
        const profitStr = `${profitPos ? '+' : ''}${fmt(j.profit)} (${j.profitPct.toFixed(2)}%)`;
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
                <div className="flex justify-between text-sm"><span className="text-muted-foreground text-xs">시작 자본</span><span className="font-mono">{fmt(j.startRem)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground text-xs">종료 자본</span><span className="font-mono">{fmt(j.endRem)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground text-xs">사이클 수익</span><span className={`font-mono font-semibold ${profitPos ? 'text-chart-2' : 'text-destructive'}`}>{profitStr}</span></div>
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
  const [resetDiv, setResetDiv] = useState<20 | 40>(40);
  const [pendingProfit, setPendingProfit] = useState(0);

  // 입력 필드
  const [buyQty, setBuyQty] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [revBuyAmt, setRevBuyAmt] = useState('');
  const [revBuyPrice, setRevBuyPrice] = useState('');
  const [revByeol, setRevByeol] = useState('');
  const [revSellPriceVal, setRevSellPriceVal] = useState('');
  const [revExitPrice, setRevExitPrice] = useState('');
  const [setRem, setSetRem] = useState('');
  const [setCapital, setSetCapital] = useState('');
  const [setDiv, setSetDiv] = useState<20 | 40>(40);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    syncFromSupabase().then(() => setMounted(true));
  }, []);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  // tick은 리렌더 트리거용
  void tick;
  const s = mounted ? getState(sym) : null;
  const hasPos = !!s && s.avg > 0 && s.shares > 0;
  const isReverse = s?.mode === 'reverse';

  // 권장 수량 계산
  const nb = s ? nextAmt(s.rem, s.div, s.T) : 0;
  const recAmt = tdelta === 0.5 ? nb / 2 : nb;
  const buyPriceNum = parseFloat(buyPrice);
  const recQty = buyPriceNum > 0 && nb > 0 ? Math.floor(recAmt / buyPriceNum) : 0;

  const handleInit = useCallback((capital: number, division: 20 | 40) => {
    setState(sym, defState(capital, division));
    setHist(sym, []);
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
    if (amount > cur.rem) return alert(`매수 금액(${fmt(amount)})이 잔여자본(${fmt(cur.rem)})을 초과합니다.`);
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
      const sell = Math.floor(cur.shares * 0.25);
      if (sell <= 0) return alert('보유 주수가 너무 적어 쿼터매도가 불가능합니다.');
      const s = { ...cur, shares: parseFloat((cur.shares - sell).toFixed(6)), T: parseFloat((cur.T * 0.75).toFixed(4)) };
      setState(sym, s);
      hist.push({ type: 'quarter', shares: sell, price, amount: sell * price, T: s.T, date: new Date().toLocaleDateString('ko') });
      setHist(sym, hist);
    } else {
      const profit = (price - cur.avg) * cur.shares;
      const endRem = cur.rem + cur.shares * price;
      const invested = cur.avg * cur.shares;
      const profitPct = invested > 0 ? profit / invested * 100 : 0;
      const journal = getJournal(sym);
      journal.push({ cycle: cur.cycle ?? 1, div: cur.div, startRem: endRem - profit, endRem, profit, profitPct, startDate: cur.cycleStartDate ?? '—', endDate: new Date().toLocaleDateString('ko') });
      setJournal(sym, journal);
      setHist(sym, []);
      const newS = { ...cur, rem: endRem, total: endRem, cycle: (cur.cycle ?? 1) + 1, cycleStartRem: endRem, cycleStartDate: null, shares: 0, T: 0, avg: 0, mode: 'normal' as const, reverseDay: 0 };
      setState(sym, newS);
      setPendingProfit(profit);
      setResetCapital(endRem.toFixed(2));
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
    const qty = revSellQty(cur.shares, cur.div);
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
    const qty = parseFloat((amount / price).toFixed(6));
    saveSnapshot(sym);
    const s = { ...cur };
    s.avg = s.shares > 0 ? newAvg(s.avg, s.shares, price, qty) : price;
    s.shares = parseFloat((s.shares + qty).toFixed(6));
    s.rem -= amount;
    s.T = revTBuy(s.T, s.div);
    setState(sym, s);
    const hist = getHist(sym);
    hist.push({ type: 'rbuy', shares: qty, price, amount, T: s.T, date: new Date().toLocaleDateString('ko') });
    setHist(sym, hist);
    setRevBuyAmt(''); setRevBuyPrice('');
    refresh();
  }, [sym, revBuyAmt, revBuyPrice, refresh]);

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
            <label className="text-xs text-muted-foreground">총 자본 (달러)</label>
            <input id="ob-capital" type="number" defaultValue="10000" className="bg-input border border-border rounded px-3 py-2 text-sm font-mono w-40 outline-none focus:border-ring" />
          </div>
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs text-muted-foreground">분할 수</label>
            <select id="ob-division" className="bg-input border border-border rounded px-3 py-2 text-sm w-40 outline-none focus:border-ring">
              <option value="40">40분할 — 안정형</option>
              <option value="20">20분할 — 공격형</option>
            </select>
          </div>
          <button
            onClick={() => {
              const cap = parseFloat((document.getElementById('ob-capital') as HTMLInputElement).value) || 10000;
              const div = parseInt((document.getElementById('ob-division') as HTMLSelectElement).value) as 20 | 40 || 40;
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
      <StatusBar s={s} />

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

      <TargetCards s={s} sym={sym} />
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
                  <label className="block text-xs text-muted-foreground mb-1.5">매수 수량 (주)</label>
                  <input type="number" value={buyQty} onChange={e => setBuyQty(e.target.value)}
                    placeholder="예: 3" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">매수가 (달러)</label>
                  <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                    placeholder="예: 73.05" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
              </div>
              {recQty > 0 && (
                <p className="text-xs text-muted-foreground font-mono">
                  권장: {fmt(recAmt)}{recQty > 0 ? ` ≈ ${recQty}주` : ''}
                  {tdelta === 0.5 ? ` (1회매수금 ${fmt(nb)}의 절반)` : ''}
                </p>
              )}
              {recQty > 0 && parseFloat(buyQty) > recQty && (
                <p className="text-xs text-amber-500">권장 수량({recQty}주)을 초과했습니다. T값이 예상보다 빠르게 증가합니다.</p>
              )}
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
              <p className="text-xs text-muted-foreground">실제로 매수를 체결한 후, 체결 금액과 체결가를 그대로 입력하세요.</p>
              <button onClick={handleBuy} className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">매수 기록하기</button>
            </div>
          )}
          {tab === 'buy' && isReverse && (
            <div className="flex flex-col gap-4">
              <div className="bg-muted/40 border border-border rounded p-3 text-sm flex justify-between">
                <span className="text-xs text-muted-foreground">오늘 매수금액 (잔금 ÷ 4)</span>
                <span className="font-mono">{s.reverseDay > 0 ? fmt(s.rem / 4) : '첫날 매수 없음'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">매수 금액 (달러)</label>
                  <input type="number" value={revBuyAmt} onChange={e => setRevBuyAmt(e.target.value)}
                    placeholder="잔금/4 자동" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">매수가 (달러)</label>
                  <input type="number" value={revBuyPrice} onChange={e => setRevBuyPrice(e.target.value)}
                    placeholder="별지점 아래 LOC 체결가" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">별지점(5거래일 평균) 아래에서 LOC 매수. D1 첫날은 매수 없음.</p>
              <button onClick={handleReverseBuy} className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">리버스 매수 기록</button>
            </div>
          )}

          {/* 매도 탭 */}
          {tab === 'sell' && !isReverse && (
            <div className="flex flex-col gap-4">
              <div className="bg-muted/40 border border-border rounded p-3 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-xs text-muted-foreground">쿼터매도 목표가</span>
                  <span className="font-mono">{hasPos ? fmt(bPrice(s.avg, sym, s.div, s.T)) : '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-xs text-muted-foreground">지정가매도 목표가 (잔여 ¾)</span>
                  <span className="font-mono">{hasPos ? fmt(ftPrice(s.avg, sym)) : '—'}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">실제 매도가 (비우면 목표가 자동 사용)</label>
                <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                  placeholder="비워두면 목표가 자동 사용" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
              </div>
              <p className="text-xs text-muted-foreground">목표가에 정확히 체결되지 않았다면 실제 체결가를 입력하세요.</p>
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
                  <span className="font-mono">{hasPos ? `${revSellQty(s.shares, s.div)}주` : '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-xs text-muted-foreground">리버스 별지점 (5거래일 평균)</span>
                  <span className="font-mono">{revByeol ? fmt(parseFloat(revByeol)) : '입력 필요'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">5거래일 평균 종가 (별지점)</label>
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
                  <label className="block text-xs text-muted-foreground mb-1.5">총 자본 재설정 (달러)</label>
                  <input type="number" value={setCapital} onChange={e => setSetCapital(e.target.value)}
                    placeholder="10000" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">분할 수 재설정</label>
                  <select value={setDiv} onChange={e => setSetDiv(parseInt(e.target.value) as 20 | 40)}
                    className="w-full bg-input border border-border rounded px-3 py-2 text-sm outline-none focus:border-ring">
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
                  <label className="block text-xs text-muted-foreground mb-1.5">잔여자본 직접 수정 (달러)</label>
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
                  alert(`잔여자본이 ${fmt(val)}으로 수정되었습니다.`);
                }} className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">잔여자본 수정</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <TradeHistory sym={sym} onUndo={handleUndo} />

      {/* 사이클 완료 모달 */}
      {showReset && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm flex flex-col gap-4">
            <div>
              <h3 className="text-base font-semibold">사이클 완료</h3>
              <p className="text-sm text-muted-foreground mt-1">
                손익: <span className={`font-mono font-semibold ${pendingProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {pendingProfit >= 0 ? '+' : ''}{fmt(pendingProfit)}
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
                <select value={resetDiv} onChange={e => setResetDiv(parseInt(e.target.value) as 20 | 40)}
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm outline-none focus:border-ring">
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Symbol, TabName } from '@/lib/types';
import { defState, bPrice, ftPrice, targetPrice, nextAmt, newAvg, revTSell, revTBuy, revSellQty, qtyFloor, shouldEnterReverse, fmt, conf, totalFees, locLadder } from '@/lib/calc';
import { getState, setState, getHist, setHist, getJournal, setJournal, getUndo, setUndo, saveSnapshot, syncFromSupabase, pushToSupabase, getLastQP, setLastQP, getParkN, setParkN as saveParkN } from '@/lib/storage';
import { StatusBar } from './quant-app/status-bar';
import { TargetCards } from './quant-app/target-cards';
import { LocGuide } from './quant-app/loc-guide';
import { TradeHistory } from './quant-app/trade-history';
import { JournalTab } from './quant-app/journal-tab';

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────

export type OpenOrder = { orderId: string; side: 'BUY' | 'SELL'; orderType: 'LIMIT'; timeInForce?: 'CLS'; quantity: string; price: string };

// 통화별 파킹 ETF — USD는 SGOV(초단기 미국채), KRW는 TIGER KOFR금리액티브(합성, 449170)
const PARK_ETF: Record<'USD' | 'KRW', { code: string; label: string }> = {
  USD: { code: 'SGOV', label: 'SGOV' },
  KRW: { code: '449170', label: 'TIGER KOFR' },
};
const PARK_SYMBOLS: Record<'USD' | 'KRW', Symbol[]> = {
  USD: ['TQQQ', 'SOXL', 'RAM'],
  KRW: ['HYNIX2X'],
};

export default function QuantApp({ sym, openOrders, setOpenOrders }: {
  sym: Symbol;
  openOrders: OpenOrder[] | null;
  setOpenOrders: (orders: OpenOrder[] | null) => void;
}) {
  const [tab, setTab] = useState<TabName>('buy');
  const [tdelta, setTdelta] = useState(1.0);
  const [tick, setTick] = useState(0); // 리렌더 트리거

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
  const [setAvg, setSetAvg] = useState('');
  const [setShares, setSetShares] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [limitPriceLoading, setLimitPriceLoading] = useState(false);
  const [lastQuarterProceeds, setLastQuarterProceeds] = useState(0);
  const [setDiv, setSetDiv] = useState<10 | 20 | 40>(40);

  const [mounted, setMounted] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'ok' | 'error' | 'empty'>('idle');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [orderDraft, setOrderDraft] = useState<{
    label: string; side: 'BUY' | 'SELL'; orderType: 'LIMIT'; timeInForce?: 'CLS';
    price: string; quantity: string; clientOrderId: string;
    maxQty: number; allocAmt?: number;
  } | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderStatus, setOrderStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [orderErrMsg, setOrderErrMsg] = useState('');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [parkN, setParkN] = useState('4');
  const [parkInfo, setParkInfo] = useState<{ price: number; qty: number } | null>(null);
  const [parkLoading, setParkLoading] = useState(false);
  const [parkStatus, setParkStatus] = useState<'idle' | 'error'>('idle');
  useEffect(() => {
    setMounted(true);
    setLastQuarterProceeds(getLastQP(sym));
    setParkN(String(getParkN(sym)));
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
  // 모달 기본 수량: recQty(현재가 기준)가 maxQty(주문가 기준 안전 수량)를 넘지 않도록 캡 — 종가와 주문가 차이로 인한 과매수 방지
  const capRecQty = (maxQty: number) => recQty > 0 && maxQty > 0 ? Math.min(recQty, maxQty) : recQty > 0 ? recQty : maxQty > 0 ? maxQty : 1;
  // 첫 진입: 포지션 없지만 현재가 입력됨 → 주문 버튼 표시
  const isFirst = !!s && s.shares === 0 && s.avg === 0 && buyPriceNum > 0 && sym !== 'BTC';

  // LOC 사다리 (후반전 전용) — 전반전은 평단가 LOC가 아래 구간을 이미 담당하므로 미표시
  const showLadder = hasPos && !isReverse && cur === 'USD' && !!s && s.T >= s.div / 2;
  const ladderByeolPt = showLadder && s ? bPrice(s.avg, sym, s.div, s.T) - conf(sym).tick : 0;
  const ladder = showLadder ? locLadder(nb, ladderByeolPt, sym) : { baseQty: 0, rungs: [] as { n: number; price: number }[] };

  // 파킹 계산 — N회차분 매수금액만 현금으로 남기고 나머지 파킹 (USD: SGOV, KRW: TIGER KOFR)
  // 쿼터매도 수익(재투입 전)은 rem에 없지만 놀고 있는 현금이므로 파킹 목표에 포함
  const parkEtf = cur === 'USD' || cur === 'KRW' ? PARK_ETF[cur] : null;
  const parkNNum = Math.max(1, Math.floor(parseFloat(parkN)) || 4);
  const parkBuffer = s ? Math.min(parkNNum, Math.max(s.div - s.T, 0)) * nb : 0;
  const parkAmt = s ? Math.max(0, s.rem + lastQuarterProceeds - parkBuffer) : 0;
  // 파킹 ETF는 통화별로 계좌에 하나뿐이므로, 같은 통화의 다른 심볼 권장 파킹액까지 합산한 목표와 비교
  const otherParkTargets = s && (cur === 'USD' || cur === 'KRW')
    ? PARK_SYMBOLS[cur]
        .filter(sy => sy !== sym)
        .map(sy => {
          const st = getState(sy);
          if (!st || st.mode !== 'normal') return { sy, amt: 0 };
          const a = nextAmt(st.rem, st.div, st.T);
          const buf = Math.min(getParkN(sy), Math.max(st.div - st.T, 0)) * a;
          return { sy, amt: Math.max(0, st.rem + getLastQP(sy) - buf) };
        })
        .filter(x => x.amt > 0)
    : [];
  const totalParkTarget = parkAmt + otherParkTargets.reduce((acc, x) => acc + x.amt, 0);
  const parkHeld = parkInfo ? parkInfo.qty * parkInfo.price : 0;
  const parkGap = totalParkTarget - parkHeld;

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
      : targetPrice(type === 'quarter' ? bPrice(cur.avg, sym, cur.div, cur.T) : ftPrice(cur.avg, sym), sym);
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
      const journal = getJournal(sym);
      const cycleHist = [...hist, { type: 'all' as const, shares: cur.shares, price, amount: cur.shares * price, T: cur.T, date: new Date().toLocaleDateString('ko') }];
      const fees = totalFees(cycleHist, sym);
      const netProfit = journalProfit - fees;
      const netProfitPct = startRem > 0 ? netProfit / startRem * 100 : 0;
      journal.push({ cycle: cur.cycle ?? 1, div: cur.div, startRem, endRem: journalEndRem, profit: netProfit, profitPct: netProfitPct, startDate: cur.cycleStartDate ?? '—', endDate: new Date().toLocaleDateString('ko'), trades: cycleHist });
      setJournal(sym, journal);
      setHist(sym, []);
      const newS = { ...cur, rem: nextRem, total: nextRem, cycle: (cur.cycle ?? 1) + 1, cycleStartRem: nextRem, cycleStartDate: null, cycleSeed: nextRem, shares: 0, T: 0, avg: 0, mode: 'normal' as const, reverseDay: 0 };
      setState(sym, newS);
      // 사이클 종료 시 재설정 자본(가이드 4번)에 쿼터매도 수익이 이미 반영되므로 잔존값 제거 — 안 지우면 다음 사이클에서 SGOV 목표에 중복 가산됨
      setLastQuarterProceeds(0);
      setLastQP(sym, 0);
      setSellPrice('');
      refresh();
      alert(`사이클 완료!\n손익: ${netProfit >= 0 ? '+' : ''}${f(netProfit)} (${netProfitPct >= 0 ? '+' : ''}${netProfitPct.toFixed(2)}%)`);
      return;
    }
    setSellPrice('');
    refresh();
  }, [sym, sellPrice, refresh]);

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

  const handleParkCheck = useCallback(async () => {
    if (!parkEtf) return;
    setParkLoading(true);
    setParkStatus('idle');
    try {
      const [priceRes, holdRes] = await Promise.all([
        fetch(`/api/toss/price?symbol=${parkEtf.code}`),
        fetch(`/api/toss/holdings?symbol=${parkEtf.code}`),
      ]);
      if (!priceRes.ok || !holdRes.ok) throw new Error(`${parkEtf.label} 조회 실패`);
      const priceData = await priceRes.json() as { price: string | number };
      const holdData = await holdRes.json() as { quantity: number };
      const price = parseFloat(String(priceData.price));
      if (!(price > 0)) throw new Error('가격 없음');
      setParkInfo({ price, qty: holdData.quantity ?? 0 });
    } catch {
      setParkStatus('error');
      setParkInfo(null);
    } finally {
      setParkLoading(false);
    }
  }, [parkEtf]);

  const loadOpenOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/toss/order?symbol=${sym}`);
      const data = await res.json() as { orders?: OpenOrder[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setOpenOrders(data.orders ?? []);
    } catch {
      setOpenOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [sym]);

  const cancelOrderById = useCallback(async (orderId: string) => {
    if (!orderId || orderId === 'undefined') {
      alert('주문 ID가 없습니다. 목록을 새로 고침 후 다시 시도하세요.');
      return;
    }
    setCancellingId(orderId);
    try {
      const res = await fetch(`/api/toss/order/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        // 목록 갱신 후 에러 표시
        const refreshRes = await fetch(`/api/toss/order?symbol=${sym}`);
        const refreshData = await refreshRes.json() as { orders?: OpenOrder[] };
        if (refreshRes.ok) setOpenOrders(refreshData.orders ?? []);
        const msg = res.status === 404
          ? '이 주문은 웹에서 취소할 수 없습니다.\n토스 앱에서 직접 취소하세요.'
          : `취소 실패: ${data.error ?? `HTTP ${res.status}`}`;
        alert(msg);
        return;
      }
      setOpenOrders(openOrders ? openOrders.filter(o => o.orderId !== orderId) : null);
    } catch (e) {
      alert(`취소 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally {
      setCancellingId(null);
    }
  }, [sym, openOrders, setOpenOrders]);

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
      const text = await res.text();
      let data: { error?: string } = {};
      try { data = JSON.parse(text); } catch { /* HTML 오류 페이지 */ }
      if (!res.ok) throw new Error(data.error ?? `서버 오류 (HTTP ${res.status}) — 배포 환경에서 다시 시도하세요`);
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
    const qty = capRecQty(maxQty);
    setOrderDraft({ label, side: 'BUY', orderType: 'LIMIT', timeInForce: 'CLS', price: fmtOrderPrice(orderPrice), quantity: String(qty), clientOrderId: `${sym}-BUY-BYEOL-${Date.now()}`, maxQty, allocAmt: locAmt });
  };

  const openAvgLocOrder = () => {
    if (!s || !hasPos) return;
    const avgPt = s.avg - conf(sym).tick;
    if (avgPt <= 0) return alert('평단가를 계산할 수 없습니다.');
    const allocAmt = nb / 2;
    const maxQty = qtyFloor(allocAmt / avgPt, sym);
    const qty = capRecQty(maxQty);
    setOrderDraft({ label: '평단가 LOC 매수', side: 'BUY', orderType: 'LIMIT', timeInForce: 'CLS', price: fmtOrderPrice(avgPt), quantity: String(qty), clientOrderId: `${sym}-BUY-AVG-${Date.now()}`, maxQty, allocAmt });
  };

  const openCustomLimitOrder = () => {
    if (!s || (!hasPos && !isFirst)) return;
    const orderPrice = parseFloat(limitPrice);
    if (!orderPrice || orderPrice <= 0) return alert('가격을 입력하세요.');
    const maxQty = qtyFloor(nb / orderPrice, sym);
    const qty = capRecQty(maxQty);
    const id = `${sym}-BUY-LIMIT-${Date.now()}`;
    setOrderDraft({ label: '지정가 매수', side: 'BUY', orderType: 'LIMIT', price: fmtOrderPrice(orderPrice), quantity: String(qty), clientOrderId: id, maxQty });
  };

  const openCustomLocOrder = () => {
    if (!s || (!hasPos && !isFirst)) return;
    const orderPrice = parseFloat(limitPrice);
    if (!orderPrice || orderPrice <= 0) return alert('가격을 입력하세요.');
    const maxQty = qtyFloor(nb / orderPrice, sym);
    const qty = capRecQty(maxQty);
    const id = `${sym}-BUY-LOC-${Date.now()}`;
    setOrderDraft({ label: '커스텀 LOC 매수', side: 'BUY', orderType: 'LIMIT', timeInForce: 'CLS', price: fmtOrderPrice(orderPrice), quantity: String(qty), clientOrderId: id, maxQty, allocAmt: nb });
  };

  const openLadderOrder = (price: number, qty: number, label: string) => {
    if (!s) return;
    setOrderDraft({ label, side: 'BUY', orderType: 'LIMIT', timeInForce: 'CLS', price: fmtOrderPrice(price), quantity: String(qty), clientOrderId: `${sym}-BUY-LADDER-${Date.now()}`, maxQty: qty, allocAmt: nb });
  };

  const openQuarterSellOrder = () => {
    if (!s || !hasPos) return;
    const price = targetPrice(bPrice(s.avg, sym, s.div, s.T), sym);
    const maxQty = qtyFloor(s.shares * 0.25, sym);
    if (maxQty <= 0) return alert('보유 수량이 너무 적습니다.');
    const isLoc = conf(sym).currency === 'USD' && sym !== 'BTC';
    setOrderDraft({ label: '쿼터매도 주문 (¼)', side: 'SELL', orderType: 'LIMIT', ...(isLoc ? { timeInForce: 'CLS' as const } : {}), price: fmtOrderPrice(price), quantity: String(maxQty), clientOrderId: `${sym}-SELL-QUARTER-${Date.now()}`, maxQty });
  };

  const openLimitSellOrder = () => {
    if (!s || !hasPos) return;
    const price = targetPrice(ftPrice(s.avg, sym), sym);
    let maxQty: number;
    if (sym === 'HYNIX2X') {
      maxQty = s.shares;
    } else {
      const quarterQty = qtyFloor(s.shares * 0.25, sym);
      maxQty = parseFloat((s.shares - quarterQty).toFixed(6));
    }
    if (maxQty <= 0) return alert('보유 수량이 너무 적습니다.');
    const label = sym === 'HYNIX2X' ? '지정가매도 주문 (전량)' : '지정가매도 주문 (¾)';
    setOrderDraft({ label, side: 'SELL', orderType: 'LIMIT', price: fmtOrderPrice(price), quantity: String(maxQty), clientOrderId: `${sym}-SELL-LIMIT-${Date.now()}`, maxQty });
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
          {(['buy','sell','journal','setting','guide'] as TabName[]).map((t, i) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {['① 매수','② 매도','③ 매매일지','④ 설정','⑤ 가이드'][i]}
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
              <p className="text-xs text-muted-foreground">
                {sym === 'BTC'
                  ? '별지점/평단가 이하로 떨어진 날 매수 후 체결가를 입력하세요. 둘 다 닿았으면 전체 체결, 별지점만 닿았으면 절반 체결을 선택하세요.'
                  : '실제로 매수를 체결한 후, 체결 금액과 체결가를 그대로 입력하세요.'}
              </p>
              {((hasPos || isFirst) || (openOrders !== null && openOrders.length > 0)) && sym !== 'BTC' && (
                <div className="border-t border-border pt-3 flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">토스증권 주문 전송{isFirst ? ' — 첫 진입 (현재가 기준)' : ''}</p>
                  <div className="border border-border/50 rounded p-2 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground/60">미체결 주문</p>
                      <button onClick={loadOpenOrders} disabled={ordersLoading} className="text-xs text-primary hover:underline disabled:opacity-40">
                        {ordersLoading ? '조회 중...' : '확인'}
                      </button>
                    </div>
                    {openOrders !== null && (
                      openOrders.length === 0
                        ? <p className="text-xs text-muted-foreground/60">미체결 주문 없음</p>
                        : openOrders.map(order => (
                            <div key={order.orderId} className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono text-muted-foreground">
                                <span className={order.side === 'BUY' ? 'text-red-500' : 'text-blue-500'}>
                                  {order.side === 'BUY' ? (order.timeInForce === 'CLS' ? 'LOC매수' : '지정매수') : (order.timeInForce === 'CLS' ? 'LOC매도' : '지정매도')}
                                </span>{' '}
                                {f(parseFloat(order.price))} × {order.quantity}{conf(sym).unit}
                              </span>
                              <button
                                onClick={() => cancelOrderById(order.orderId)}
                                disabled={cancellingId === order.orderId}
                                className="text-xs text-destructive hover:underline disabled:opacity-40 shrink-0"
                              >
                                {cancellingId === order.orderId ? '취소 중...' : '취소'}
                              </button>
                            </div>
                          ))
                    )}
                  </div>
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
                  {showLadder && ladder.rungs.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground/60">LOC 사다리 (과매수 방지)</p>
                      {ladder.baseQty > 0 && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-muted-foreground">별지점 {f(ladderByeolPt)} × {ladder.baseQty}{conf(sym).unit}</span>
                          <button onClick={() => openLadderOrder(ladderByeolPt, ladder.baseQty, `별지점 LOC 매수 (사다리 ${ladder.baseQty}${conf(sym).unit})`)} className="text-xs text-primary hover:underline shrink-0">주문</button>
                        </div>
                      )}
                      {ladder.rungs.map(r => (
                        <div key={r.n} className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-muted-foreground">÷{r.n} {f(r.price)} × 1{conf(sym).unit}</span>
                          <button onClick={() => openLadderOrder(r.price, 1, `LOC 사다리 매수 (÷${r.n})`)} className="text-xs text-primary hover:underline shrink-0">주문</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-muted-foreground/60">지정가</p>
                    <div className="flex gap-2 items-center">
                      <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                        placeholder="가격 입력" className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                      <button onClick={async () => {
                          setLimitPriceLoading(true);
                          try {
                            const res = await fetch(`/api/toss/price?symbol=${sym}`);
                            const data = await res.json();
                            if (data.price) {
                              const raw = conf(sym).currency === 'KRW' ? String(Math.round(parseFloat(data.price))) : data.price;
                              setLimitPrice(raw);
                            }
                          } catch {} finally { setLimitPriceLoading(false); }
                        }} disabled={limitPriceLoading} className="text-xs text-primary hover:underline disabled:opacity-40 shrink-0">
                          {limitPriceLoading ? '조회 중...' : '현재가'}
                        </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={openCustomLimitOrder} className="flex-1 border border-primary/50 text-primary py-2 rounded text-xs font-semibold hover:bg-primary/10 transition-colors">지정가 주문</button>
                      {cur === 'USD' && (
                        <button onClick={openCustomLocOrder} className="flex-1 border border-border text-muted-foreground py-2 rounded text-xs font-semibold hover:bg-muted/50 transition-colors">LOC 주문</button>
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
                  <span className="font-mono">{hasPos ? f(targetPrice(bPrice(s.avg, sym, s.div, s.T), sym)) : '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-xs text-muted-foreground">지정가매도 목표가 {sym === 'HYNIX2X' ? '(전량)' : '(잔여 ¾)'}</span>
                  <span className="font-mono">{hasPos ? f(targetPrice(ftPrice(s.avg, sym), sym)) : '—'}</span>
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
                  <div className="border border-border/50 rounded p-2 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground/60">미체결 주문</p>
                      <button onClick={loadOpenOrders} disabled={ordersLoading} className="text-xs text-primary hover:underline disabled:opacity-40">
                        {ordersLoading ? '조회 중...' : '확인'}
                      </button>
                    </div>
                    {openOrders !== null && (
                      openOrders.length === 0
                        ? <p className="text-xs text-muted-foreground/60">미체결 주문 없음</p>
                        : openOrders.map(order => (
                            <div key={order.orderId} className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono text-muted-foreground">
                                <span className={order.side === 'BUY' ? 'text-red-500' : 'text-blue-500'}>
                                  {order.side === 'BUY' ? (order.timeInForce === 'CLS' ? 'LOC매수' : '지정매수') : (order.timeInForce === 'CLS' ? 'LOC매도' : '지정매도')}
                                </span>{' '}
                                {f(parseFloat(order.price))} × {order.quantity}{conf(sym).unit}
                              </span>
                              <button
                                onClick={() => cancelOrderById(order.orderId)}
                                disabled={cancellingId === order.orderId}
                                className="text-xs text-destructive hover:underline disabled:opacity-40 shrink-0"
                              >
                                {cancellingId === order.orderId ? '취소 중...' : '취소'}
                              </button>
                            </div>
                          ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={openQuarterSellOrder} className="flex-1 border border-border text-muted-foreground py-2 rounded text-xs font-semibold hover:bg-muted/50 transition-colors">쿼터매도 주문</button>
                    <button onClick={openLimitSellOrder} className="flex-1 border border-primary/50 text-primary py-2 rounded text-xs font-semibold hover:bg-primary/10 transition-colors">지정가매도 주문</button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => handleSell('quarter')} className="flex-1 bg-secondary text-secondary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity border border-border">쿼터매도 (¼)</button>
                <button onClick={() => handleSell('all')} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">지정가매도 {sym === 'HYNIX2X' ? '(전량)' : '(¾)'}</button>
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

          {/* 가이드 탭 — SGOV 파킹 운용 순서 */}
          {tab === 'guide' && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-sm font-medium">대기자금 파킹 운용 가이드</p>
                <p className="text-xs text-muted-foreground mt-1">
                  대기 현금을 파킹 ETF에 넣어 이자를 받는 운용 순서입니다. USD 심볼은 SGOV(초단기 미국채, 연 4% 안팎), HYNIX2X는 TIGER KOFR금리액티브(449170, 연 2.5% 안팎)로 동일하게 운용합니다.
                  원칙: 앞으로 N회차분 매수금액만 현금으로 남기고, 나머지는 전부 파킹.
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium mb-1.5">1. 최초 파킹 — 처음 시작할 때 한 번</p>
                <ul className="text-xs text-muted-foreground flex flex-col gap-1 list-disc pl-4">
                  <li>④ 설정 탭 → &quot;SGOV 조회&quot; → <b className="text-foreground">계좌 전체 목표</b>만큼 SGOV 매수 (여러 종목 운용 시 몫이 자동 합산됨)</li>
                  <li>SGOV는 타이밍이 무의미한 상품 — 아무 때나 현재가 근처 지정가로 매수</li>
                </ul>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium mb-1.5">2. 평소 루틴 — 매수가 체결된 날</p>
                <ul className="text-xs text-muted-foreground flex flex-col gap-1 list-disc pl-4">
                  <li>① 매수 탭에 체결 기록 → ④ 설정 탭에서 &quot;SGOV 조회&quot;</li>
                  <li>&quot;적정 수준&quot; → 아무것도 안 함</li>
                  <li>소액 &quot;매도 권장&quot; → 모아뒀다가 현금이 절반쯤 줄었을 때 한 번에 매도</li>
                  <li>연속 하락으로 큰 &quot;매도 권장&quot; → 바로 매도해서 다음 LOC 주문 걸 현금 확보</li>
                </ul>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium mb-1.5">3. 쿼터매도가 나온 날</p>
                <ul className="text-xs text-muted-foreground flex flex-col gap-1 list-disc pl-4">
                  <li>② 매도 탭에 쿼터매도 기록 — <b className="text-foreground">잔여자본에는 재투입하지 않음</b> (원금이 커져 리버스모드 위험이 늘어남, 백테스트로 확인됨)</li>
                  <li>④ 설정 탭 → &quot;SGOV 조회&quot; — 미재투입 쿼터매도 수익이 목표에 자동 포함되어 표시됨</li>
                  <li>&quot;매수 권장&quot;만큼 SGOV 추가 매수 — 잔여자본은 건드리지 않고 끝</li>
                </ul>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium mb-1.5">4. 사이클 종료(전량매도) 날</p>
                <ul className="text-xs text-muted-foreground flex flex-col gap-1 list-disc pl-4">
                  <li>전량매도 기록 → 잔여자본이 자동 갱신되지만 <b className="text-foreground">쿼터매도 수익·SGOV 이자는 빠져 있음</b></li>
                  <li>④ 설정 탭 → &quot;SGOV 조회&quot;로 평가액 확인 → &quot;잔여자본 직접 수정&quot;에 아래 값 입력:</li>
                  <li className="list-none -ml-4">
                    <span className="font-mono text-foreground bg-input border border-border rounded px-2 py-1 inline-block mt-1">
                      (토스 달러 잔액 + SGOV 평가액) − 다른 심볼 잔여자본 합
                    </span>
                  </li>
                  <li>SGOV 평가액은 조회 결과의 괄호 안 숫자 그대로(실제 보유량 × 현재가) — 권장 파킹액이 아님, 이자까지 자동 포함됨</li>
                  <li>새 사이클 첫 매수 기록 후 &quot;SGOV 조회&quot; → 커진 목표만큼 재파킹</li>
                </ul>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium mb-1.5">5. 월초 — 분배금 입금일</p>
                <ul className="text-xs text-muted-foreground flex flex-col gap-1 list-disc pl-4">
                  <li>(토스 달러 잔액 + SGOV 평가액) − 모든 심볼 잔여자본 합 = 아직 반영 안 된 이자</li>
                  <li>이 차액을 주력 심볼 하나의 잔여자본에만 더하기 (복리 재투입)</li>
                </ul>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium mb-1.5">⚠️ 주의사항</p>
                <ul className="text-xs text-muted-foreground flex flex-col gap-1 list-disc pl-4">
                  <li>SGOV에 넣은 돈으로는 LOC 주문을 못 겁니다 — 현금 버퍼(N회차분)를 항상 유지</li>
                  <li>외부에서 새로 입금하는 돈은 반드시 <b className="text-foreground">먼저 잔여자본에 반영</b>하고 넣기 — 잔여자본 수정 → SGOV 조회 → 매수 권장만큼 매수 (쿼터매도 수익은 예외 — 위 3번처럼 잔여자본 안 건드리고 바로 파킹)</li>
                  <li>전략에 넣지 않을 돈(비상금 등)은 이 계좌의 SGOV로 사지 않기 — 장부에 없는 돈이 섞이면 조회할 때마다 &quot;매도 권장&quot;이 잘못 뜹니다</li>
                  <li>18일 안에 쓸 돈은 파킹하지 않기 — 왕복 수수료 0.2%가 이자보다 큽니다 (HYNIX2X는 원화 예수금도 연 1% 지급되지만 KOFR가 더 높아, 손익분기가 약 1주일로 더 짧습니다)</li>
                  <li>SGOV 매수/매도 후 앱에 기록할 필요 없음 — 잔여자본은 &quot;현금 + SGOV&quot; 합계 개념이라 변동 없음</li>
                </ul>
              </div>
            </div>
          )}

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
                // 0 입력 허용 — 운용하지 않는 심볼을 비우는 용도 (빈 입력만 기본값 10000)
                const parsed = parseFloat(setCapital);
                const cap = isNaN(parsed) || parsed < 0 ? 10000 : parsed;
                if (!confirm(`${sym}을 초기화하시겠습니까?`)) return;
                setState(sym, defState(cap, setDiv));
                setHist(sym, []);
                setSetCapital('');
                setTab('buy');
                refresh();
              }} className="bg-secondary text-secondary-foreground border border-border py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">초기화 후 재시작</button>
              <div className="border-t border-border pt-4 flex flex-col gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">잔여자본 직접 수정 — 실제 현금이 늘거나 줄었을 때 ({unit})</label>
                  <input type="number" value={setRem} onChange={e => setSetRem(e.target.value)}
                    placeholder="실제 남은 현금 입력" className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                </div>
                <p className="text-xs text-muted-foreground">T값·평단가·보유주식은 유지되고, 잔여자본과 화면의 총 자본이 늘어난(줄어든) 만큼 같이 변경됩니다.</p>
                <button onClick={() => {
                  const val = parseFloat(setRem);
                  if (!val || val <= 0) return alert('올바른 금액을 입력하세요.');
                  const cur = getState(sym);
                  if (!cur) return;
                  const delta = val - cur.rem;
                  setState(sym, { ...cur, rem: val, cycleStartRem: (cur.cycleStartRem ?? cur.rem) + delta });
                  setSetRem('');
                  refresh();
                  alert(`잔여자본이 ${f(val)}으로 수정되었습니다.`);
                }} className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">잔여자본 수정</button>
              </div>
              {sym === 'BTC' && (
                <div className="border-t border-border pt-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">평단가 직접 수정 ({unit})</label>
                      <input type="number" value={setAvg} onChange={e => setSetAvg(e.target.value)}
                        placeholder={s?.avg ? s.avg.toFixed(2) : '0'} className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">보유수량 직접 수정 (BTC)</label>
                      <input type="number" value={setShares} onChange={e => setSetShares(e.target.value)}
                        placeholder={s?.shares ? s.shares.toFixed(6) : '0'} className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">거래소 실제 수치와 다를 때 수동으로 맞춥니다. T값·잔여자본은 유지됩니다.</p>
                  <button onClick={() => {
                    const avg = parseFloat(setAvg);
                    const shares = parseFloat(setShares);
                    if ((!avg && avg !== 0) && (!shares && shares !== 0)) return alert('평단가 또는 보유수량을 입력하세요.');
                    const cur = getState(sym);
                    if (!cur) return;
                    const next = { ...cur };
                    if (avg > 0) next.avg = avg;
                    if (shares >= 0) next.shares = shares;
                    saveSnapshot(sym);
                    setState(sym, next);
                    setSetAvg('');
                    setSetShares('');
                    refresh();
                    alert('수정됐습니다. 되돌리기로 복원 가능합니다.');
                  }} className="bg-secondary text-secondary-foreground border border-border py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">평단가·보유수량 수정</button>
                </div>
              )}
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
              {sym !== 'BTC' && parkEtf && !isReverse && s && (
                <div className="border-t border-border pt-4 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-medium">{parkEtf.label} 파킹 계산</p>
                    <p className="text-xs text-muted-foreground">앞으로 N회차분 매수금액만 현금으로 남기고, 나머지 대기자금은 {parkEtf.label}에 파킹합니다</p>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">현금으로 남길 회차 수</label>
                    <input type="number" min={1} value={parkN}
                      onChange={e => {
                        setParkN(e.target.value);
                        const n = parseInt(e.target.value);
                        if (n >= 1) saveParkN(sym, n);
                      }}
                      className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
                  </div>
                  <div className="flex flex-col gap-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">현금 버퍼 ({parkNNum}회차 × {f(nb)})</span>
                      <span className="font-mono">{f(parkBuffer)}</span>
                    </div>
                    {lastQuarterProceeds > 0 && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">+ 쿼터매도 수익 (미재투입)</span>
                        <span className="font-mono">{f(lastQuarterProceeds)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">권장 {parkEtf.label} 파킹액 ({sym} 몫)</span>
                      <span className="font-mono text-primary">{f(parkAmt)}</span>
                    </div>
                    {otherParkTargets.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">계좌 전체 목표 (+{otherParkTargets.map(x => `${x.sy} ${f(x.amt)}`).join(' + ')})</span>
                        <span className="font-mono text-primary">{f(totalParkTarget)}</span>
                      </div>
                    )}
                  </div>
                  <button onClick={handleParkCheck} disabled={parkLoading}
                    className="bg-secondary text-secondary-foreground border border-border py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40">
                    {parkLoading ? '조회 중...' : `${parkEtf.label} 조회 — 현재가·보유량 비교`}
                  </button>
                  {parkInfo && (
                    <div className="flex flex-col gap-1 text-xs">
                      <p className="text-muted-foreground">
                        {parkEtf.label} 현재가 <span className="font-mono text-foreground">{f(parkInfo.price)}</span> · 보유 <span className="font-mono text-foreground">{parkInfo.qty}주 ({f(parkHeld)})</span> · 목표 <span className="font-mono text-foreground">{f(totalParkTarget)}</span>{otherParkTargets.length > 0 && ' (계좌 전체 합산)'}
                      </p>
                      {parkGap > parkInfo.price
                        ? <p className="text-primary">약 {Math.floor(parkGap / parkInfo.price)}주 매수 권장 — {f(parkGap)} 추가 파킹</p>
                        : parkGap < -parkInfo.price
                          ? <p className="text-destructive">약 {Math.floor(-parkGap / parkInfo.price)}주 매도 권장 — {f(-parkGap)} 현금 보충</p>
                          : <p className="text-muted-foreground">적정 수준입니다 — 조정이 필요 없습니다.</p>}
                    </div>
                  )}
                  {parkStatus === 'error' && <p className="text-xs text-destructive">{parkEtf.label} 조회 실패 — 다시 시도하세요.</p>}
                </div>
              )}
              <div className="border-t border-border pt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">클라우드 업로드</p>
                    <p className="text-xs text-muted-foreground">이 기기의 데이터를 클라우드에 강제 저장합니다</p>
                  </div>
                  <button onClick={async () => {
                    setUploadLoading(true);
                    setUploadStatus('idle');
                    try {
                      await pushToSupabase(sym);
                      setUploadStatus('ok');
                    } catch {
                      setUploadStatus('error');
                    } finally {
                      setUploadLoading(false);
                    }
                  }} disabled={uploadLoading}
                    className="bg-secondary text-secondary-foreground border border-border px-4 py-2 rounded text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0">
                    {uploadLoading ? '업로드 중...' : '업로드'}
                  </button>
                </div>
                {uploadStatus === 'ok' && <p className="text-xs text-primary">업로드 완료 — 다른 기기에서 새로고침하면 반영됩니다.</p>}
                {uploadStatus === 'error' && <p className="text-xs text-destructive">업로드 실패 — 다시 시도하세요.</p>}
              </div>
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

    </div>
  );
}

export { QuantApp };
export type { Symbol };

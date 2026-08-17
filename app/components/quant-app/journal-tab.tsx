import { useState } from 'react';
import type { Symbol, JournalEntry } from '@/lib/types';
import { fmt, conf, totalFees, feeBreakdown } from '@/lib/calc';
import { getState, getHist, getJournal, setJournal } from '@/lib/storage';

export function JournalTab({ sym }: { sym: Symbol }) {
  const f = (n: number | null | undefined, d = 2) => fmt(n, d, conf(sym).currency);
  const [open, setOpen] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editStartRem, setEditStartRem] = useState('');
  const [curPrice, setCurPrice] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);

  // endDate("2026. 6. 19." 형식)에서 "YYYY년 M월" 키 추출
  const parseYM = (d: string) => {
    const m = d.match(/(\d{4})\.\s*(\d{1,2})/);
    return m ? `${m[1]}년 ${parseInt(m[2])}월` : '날짜 미상';
  };

  // 가장 최근 월을 초기에 펼쳐 놓음
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => {
    const j = getJournal(sym);
    if (!j.length) return new Set<string>();
    const latest = [...j].reverse()[0];
    return new Set([parseYM(latest.endDate)]);
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void tick;

  const journal = getJournal(sym);
  const reversed = [...journal].reverse();

  // 월별 그룹핑 (최신순 유지)
  type MonthGroup = { key: string; entries: Array<{ j: JournalEntry; origIdx: number; dispNum: number }> };
  const groups: MonthGroup[] = [];
  const groupMap = new Map<string, MonthGroup>();
  reversed.forEach((j, i) => {
    const origIdx = journal.length - 1 - i;
    const dispNum = journal.length - i;
    const key = parseYM(j.endDate);
    if (!groupMap.has(key)) {
      const g: MonthGroup = { key, entries: [] };
      groups.push(g);
      groupMap.set(key, g);
    }
    groupMap.get(key)!.entries.push({ j, origIdx, dispNum });
  });

  const toggleMonth = (key: string) => {
    setOpenMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const del = (origIdx: number) => {
    const j = getJournal(sym);
    j.splice(origIdx, 1);
    setJournal(sym, j);
    setOpen(null);
    setTick(t => t + 1);
  };

  const saveStartRem = (origIdx: number) => {
    const val = parseFloat(editStartRem);
    if (!val || val <= 0) return alert('올바른 금액을 입력하세요.');
    const j = getJournal(sym);
    const entry = j[origIdx];
    const fees = entry.trades ? totalFees(entry.trades, sym) : 0;
    const profit = entry.endRem - val - fees;
    const profitPct = val > 0 ? profit / val * 100 : 0;
    j[origIdx] = { ...entry, startRem: val, profit, profitPct };
    setJournal(sym, j);
    setEditingIdx(null);
    setTick(t => t + 1);
  };

  const totalProfit = journal.reduce((s, j) => s + j.profit, 0);
  const totalProfitPos = totalProfit >= 0;

  const s = getState(sym);
  const hasOpenPosition = !!s && s.shares > 0;
  const priceNum = parseFloat(curPrice);
  let est: { profit: number; profitPct: number; startRem: number; realized: number; commission: number; secFee: number } | null = null;
  if (s && priceNum > 0) {
    const hist = getHist(sym);
    const quarterProceeds = hist.filter(h => h.type === 'quarter' && !h.reinv).reduce((sum, h) => sum + h.amount, 0);
    const estRem = s.rem + s.shares * priceNum;
    const estEndRem = estRem + quarterProceeds;
    const startRem = s.cycleStartRem ?? estRem;
    const estTrades = [...hist, { type: 'all' as const, shares: s.shares, price: priceNum, amount: s.shares * priceNum, T: s.T, date: '' }];
    const estFeeTotal = totalFees(estTrades, sym);
    const estProfit = estEndRem - startRem - estFeeTotal;
    const estFees = feeBreakdown(estTrades, sym);
    // 누적 실현손익 = 예상 수익 − 미실현 평가손익 + 수수료 (항등식 역산 — hist의 과거 평단 재구성 불필요)
    const realized = estProfit - s.shares * (priceNum - s.avg) + estFeeTotal;
    est = { profit: estProfit, profitPct: startRem > 0 ? estProfit / startRem * 100 : 0, startRem, realized, ...estFees };
  }

  if (journal.length === 0 && !hasOpenPosition) return (
    <p className="text-center text-sm text-muted-foreground py-6">완료된 사이클이 없습니다.</p>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">매매일지</span>
        <button onClick={() => { setJournal(sym, []); setOpen(null); setTick(t => t + 1); }} className="text-xs text-muted-foreground hover:text-destructive transition-colors">전체 삭제</button>
      </div>

      {/* 진행 중인 사이클 예상 수익 */}
      {hasOpenPosition && (
        <div className="bg-muted/30 border border-border rounded-lg px-3 py-2.5 flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">진행 중인 사이클 (예상)</span>
          <div className="flex gap-2 items-center">
            <input type="number" value={curPrice} onChange={e => setCurPrice(e.target.value)}
              placeholder="현재가 입력" className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
            {sym !== 'BTC' && (
              <button onClick={async () => {
                  setPriceLoading(true);
                  try {
                    const res = await fetch(`/api/toss/price?symbol=${sym}`);
                    const data = await res.json();
                    if (data.price) {
                      const rawPrice = conf(sym).currency === 'KRW' ? String(Math.round(parseFloat(data.price))) : data.price;
                      setCurPrice(rawPrice);
                    }
                  } catch {
                    // 조용히 실패
                  } finally {
                    setPriceLoading(false);
                  }
                }} disabled={priceLoading} className="text-xs text-primary hover:underline disabled:opacity-40 shrink-0">
                {priceLoading ? '조회 중...' : '조회'}
              </button>
            )}
          </div>
          {est ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground/60">사이클 시작 자본</span>
                <span className="text-xs text-muted-foreground/60 font-mono">{f(est.startRem)}</span>
              </div>
              {Math.abs(est.realized) >= 0.01 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground/60">누적 실현손익 (확정)</span>
                  <span className={`text-xs font-mono ${est.realized >= 0 ? 'text-chart-2/70' : 'text-destructive/70'}`}>
                    {est.realized >= 0 ? '+' : ''}{f(est.realized)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">예상 수익</span>
                <span className={`font-mono text-sm font-semibold ${est.profit >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                  {est.profit >= 0 ? '+' : ''}{f(est.profit)} ({est.profitPct >= 0 ? '+' : ''}{est.profitPct.toFixed(2)}%)
                </span>
              </div>
              {(est.commission > 0 || est.secFee > 0) && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground/60">거래수수료 (0.1%)</span>
                    <span className="text-xs text-muted-foreground/60 font-mono">-{f(est.commission)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground/60">SEC Fee (0.00206%)</span>
                    <span className="text-xs text-muted-foreground/60 font-mono">-{f(est.secFee)}</span>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground/60">현재가를 입력하세요</p>
          )}
        </div>
      )}

      {journal.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">완료된 사이클이 없습니다.</p>
      ) : (
        <>
      {/* 총 누적 수익 */}
      <div className="bg-muted/30 border border-border rounded-lg px-3 py-2.5 flex justify-between items-center">
        <span className="text-xs text-muted-foreground">총 누적 수익</span>
        <span className={`font-mono text-sm font-semibold ${totalProfitPos ? 'text-chart-2' : 'text-destructive'}`}>
          {totalProfitPos ? '+' : ''}{f(totalProfit)}
        </span>
      </div>

      {/* 월별 그룹 */}
      {groups.map(group => {
        const monthProfit = group.entries.reduce((s, e) => s + e.j.profit, 0);
        const monthProfitPos = monthProfit >= 0;
        const isMonthOpen = openMonths.has(group.key);
        return (
          <div key={group.key} className="flex flex-col gap-1.5">
            {/* 월 헤더 */}
            <button
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 border border-border rounded-lg hover:bg-muted/70 transition-colors"
              onClick={() => toggleMonth(group.key)}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs transition-transform duration-150 ${isMonthOpen ? 'rotate-90' : ''}`}>▶</span>
                <span className="text-sm font-semibold text-foreground">{group.key}</span>
                <span className="text-xs text-muted-foreground">{group.entries.length}사이클</span>
              </div>
              <span className={`font-mono text-sm font-semibold ${monthProfitPos ? 'text-chart-2' : 'text-destructive'}`}>
                {monthProfitPos ? '+' : ''}{f(monthProfit)}
              </span>
            </button>

            {/* 사이클 목록 */}
            {isMonthOpen && (
              <div className="flex flex-col gap-1.5 pl-2">
                {group.entries.map(({ j, origIdx, dispNum }) => {
                  const isOpen = open === origIdx;
                  const profitPos = j.profit >= 0;
                  const profitStr = `${profitPos ? '+' : ''}${f(j.profit)} (${j.profitPct.toFixed(2)}%)`;
                  return (
                    <div key={origIdx} className="bg-muted/30 border border-border rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => setOpen(isOpen ? null : origIdx)}
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
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground text-xs">시작 자본</span>
                            {editingIdx === origIdx ? (
                              <div className="flex items-center gap-1.5">
                                <input type="number" value={editStartRem} onChange={e => setEditStartRem(e.target.value)} autoFocus
                                  className="w-28 bg-input border border-border rounded px-2 py-0.5 text-xs font-mono outline-none focus:border-ring" />
                                <button onClick={() => saveStartRem(origIdx)} className="text-xs text-primary hover:underline">저장</button>
                                <button onClick={() => setEditingIdx(null)} className="text-xs text-muted-foreground hover:underline">취소</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono">{f(j.startRem)}</span>
                                <button onClick={() => { setEditingIdx(origIdx); setEditStartRem(String(j.startRem)); }} className="text-xs text-muted-foreground hover:text-primary transition-colors">수정</button>
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground text-xs">종료 자본</span><span className="font-mono">{f(j.endRem)}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground text-xs">사이클 수익</span><span className={`font-mono font-semibold ${profitPos ? 'text-chart-2' : 'text-destructive'}`}>{profitStr}</span></div>
                          {j.trades && (() => { const fb = feeBreakdown(j.trades!, sym); return (fb.commission > 0 || fb.secFee > 0) && (
                            <>
                              <div className="flex justify-between text-sm"><span className="text-muted-foreground/60 text-xs">거래수수료 (0.1%)</span><span className="font-mono text-xs text-muted-foreground/60">-{f(fb.commission)}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-muted-foreground/60 text-xs">SEC Fee (0.00206%)</span><span className="font-mono text-xs text-muted-foreground/60">-{f(fb.secFee)}</span></div>
                            </>
                          ); })()}
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
              </div>
            )}
          </div>
        );
      })}
        </>
      )}
    </div>
  );
}

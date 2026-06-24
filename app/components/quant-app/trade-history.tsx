import { useState } from 'react';
import type { Symbol, TabName } from '@/lib/types';
import { fmt, conf } from '@/lib/calc';
import { getHist, setHist, getUndo } from '@/lib/storage';

export function TradeHistory({ sym, onUndo, tab }: { sym: Symbol; onUndo: () => void; tab: TabName }) {
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
    buy: 'text-red-500', quarter: 'text-blue-500', all: 'text-blue-500',
    rsell: 'text-blue-500', rbuy: 'text-red-500',
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

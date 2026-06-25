import type { Symbol, SymbolState } from '@/lib/types';
import { fmt, conf } from '@/lib/calc';

export function StatusBar({ s, sym }: { s: SymbolState; sym: Symbol }) {
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
          <p className="font-mono text-sm font-semibold text-muted-foreground">{f(s.cycleStartRem ?? s.total ?? s.rem)}</p>
          {s.cycleSeed != null && s.cycleSeed !== (s.cycleStartRem ?? s.total ?? s.rem) && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">최초 시드 {f(s.cycleSeed)}</p>
          )}
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

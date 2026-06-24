import type { Symbol, SymbolState } from '@/lib/types';
import { bPct, bPrice, targetPrice, nextAmt, fmt, conf } from '@/lib/calc';

export function LocGuide({ s, sym }: { s: SymbolState; sym: Symbol }) {
  if (s.mode === 'reverse' || !(s.avg > 0 && s.shares > 0)) return null;
  const c = conf(sym);
  const f = (n: number | null | undefined, d = 2) => fmt(n, d, c.currency);
  const fd = (n: number) => f(targetPrice(n, sym));
  const tickStr = c.currency === 'KRW' ? `₩${c.tick}` : `$${c.tick}`;
  const bp = bPct(sym, s.div, s.T);
  const bpr = bPrice(s.avg, sym, s.div, s.T);
  const buyPt = parseFloat((bpr - c.tick).toFixed(2));
  const nb = nextAmt(s.rem, s.div, s.T);
  const half = nb / 2;
  const avgPt = parseFloat((s.avg - c.tick).toFixed(2));
  const isSecondHalf = s.T >= s.div / 2;
  const gap = (bpr - s.avg) / 2;
  const step3Pt = parseFloat((avgPt - gap).toFixed(2));
  const step4Pt = parseFloat((avgPt - 2 * gap).toFixed(2));
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
          <span className="font-mono text-sm font-semibold text-primary">{f(isSecondHalf ? nb : half)}</span>
        </div>
        {!isSecondHalf && (
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded">평단가</span>
              <div>
                <p className="font-mono text-sm font-semibold">{fd(avgPt)} 이하 {sym === 'BTC' ? '지정가' : 'LOC'}</p>
                <p className="text-xs text-muted-foreground">평단 {f(s.avg)} − {tickStr}</p>
              </div>
            </div>
            <span className="font-mono text-sm font-semibold text-primary">{f(half)}</span>
          </div>
        )}
        {!isSecondHalf && sym !== 'BTC' && (
          <>
            <div className="flex items-center justify-between px-4 py-3 opacity-55">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold border border-border text-muted-foreground px-2 py-0.5 rounded">단계 3</span>
                <div>
                  <p className="font-mono text-sm font-semibold">{fd(step3Pt)} 이하 LOC</p>
                  <p className="text-xs text-muted-foreground">평단 −{(bp / 2).toFixed(0)}% · 폭락 대비</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">추가 주문</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 opacity-55">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold border border-border text-muted-foreground px-2 py-0.5 rounded">단계 4</span>
                <div>
                  <p className="font-mono text-sm font-semibold">{fd(step4Pt)} 이하 LOC</p>
                  <p className="text-xs text-muted-foreground">평단 −{bp.toFixed(0)}% · 폭락 대비</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">추가 주문</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

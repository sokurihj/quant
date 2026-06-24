import type { Symbol, SymbolState } from '@/lib/types';
import { bPct, bPrice, ftPrice, targetPrice, nextAmt, revSellQty, fmt, conf } from '@/lib/calc';

export function TargetCards({ s, sym, revByeol }: { s: SymbolState; sym: Symbol; revByeol: string }) {
  const c = conf(sym);
  const f = (n: number | null | undefined, d = 2) => fmt(n, d, c.currency);
  const fd = (n: number) => f(targetPrice(n, sym));
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

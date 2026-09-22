'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Asset, Symbol } from '@/lib/types';
import {
  getAssets, setAssets, getTargets, setTargets, getState, type Targets,
} from '@/lib/storage';
import { conf } from '@/lib/calc';

// /api/market 응답 구조
interface Market {
  fx: number;                          // 원/달러 환율
  coins: Record<string, number>;       // 업비트 마켓코드 → 원화 시세
  stocks: Record<string, number>;      // 주식 심볼 → 현재가
}

const COINS = [
  { code: 'KRW-BTC', label: 'BTC' },
  { code: 'KRW-ETH', label: 'ETH' },
  { code: 'KRW-SOL', label: 'SOL' },
];
const SYMBOLS: Symbol[] = ['TQQQ', 'SOXL', 'HYNIX2X', 'BTC', 'RAM'];
const CATS: Asset['cat'][] = ['주식', '코인', '현금'];

const won = (v: number) => `₩${Math.round(v).toLocaleString()}`;
const pct = (v: number) => `${v.toFixed(1)}%`;
const qtyFmt = (q: number) => (q < 1 ? q.toFixed(6) : q.toFixed(4));
// 원화 금액을 달러로 환산해 보조 표기한다 (환율을 못 받았으면 빈 문자열)
const usdOf = (v: number, fx: number) => (fx > 0 ? `$${Math.round(v / fx).toLocaleString()}` : '');

// 자산 하나를 원화 환산 평가액으로 바꾼다
// 시세를 아직 못 받았으면 평단가 등으로 근사해 화면이 비어 보이지 않게 한다
const valueOf = (a: Asset, m: Market): number => {
  if (a.sym) {
    const st = getState(a.sym);
    if (!st) return 0;
    // BTC 탭은 토스 미지원이라 업비트 시세를 달러로 환산해 쓴다
    let px = m.stocks[a.sym] || st.avg;
    if (a.sym === 'BTC' && m.coins['KRW-BTC'] && m.fx) px = m.coins['KRW-BTC'] / m.fx;
    const v = st.rem + st.shares * px;
    return conf(a.sym).currency === 'USD' ? v * m.fx : v;
  }
  if (a.coin) return (a.qty ?? 0) * (m.coins[a.coin] ?? 0);
  if (a.usd != null) return a.usd * m.fx;
  return a.krw ?? 0;
};

export function Portfolio() {
  const [mounted, setMounted] = useState(false);
  const [assets, setAssetList] = useState<Asset[]>([]);
  const [targets, setTargetList] = useState<Targets>({ 주식: 65, 코인: 20, 현금: 15 });
  const [market, setMarket] = useState<Market>({ fx: 0, coins: {}, stocks: {} });
  const [loading, setLoading] = useState(false);
  // 자산 추가 폼 상태
  const [kind, setKind] = useState<'sym' | 'coin' | 'krw' | 'usd'>('sym');
  const [form, setForm] = useState({ name: '', sym: 'SOXL', coin: 'KRW-BTC', cat: '주식', amt: '' });
  const [coinCur, setCoinCur] = useState<'KRW' | 'USD'>('KRW');  // 코인 평가금액을 원/달러 중 무엇으로 입력할지
  const [coinMode, setCoinMode] = useState<'amt' | 'qty'>('amt'); // 금액으로 넣을지, 수량을 직접 넣을지
  const [editId, setEditId] = useState<string | null>(null);      // 수정 중인 자산 id
  const [editVal, setEditVal] = useState('');

  // 시세 조회 — 등록된 자산에 필요한 것만 요청한다
  const refresh = useCallback(async (list: Asset[]) => {
    setLoading(true);
    try {
      // 코인 시세는 항상 전부 받아둔다
      // (자산을 추가할 때 입력한 '금액'을 수량으로 환산하려면 시세가 미리 있어야 하므로,
      //  등록된 자산만 조회하면 첫 코인을 넣을 수 없는 문제가 생긴다)
      const stocks = [...new Set(list.filter(a => a.sym && a.sym !== 'BTC').map(a => a.sym!))].join(',');
      const q = new URLSearchParams({ coins: COINS.map(c => c.code).join(',') });
      if (stocks) q.set('stocks', stocks);
      const r = await fetch(`/api/market?${q}`);
      if (r.ok) setMarket(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const list = getAssets();
    setAssetList(list);
    setTargetList(getTargets());
    setMounted(true);
    refresh(list);
  }, [refresh]);

  const save = (list: Asset[]) => { setAssetList(list); setAssets(list); };

  // 코인은 수량을, 원화·달러는 금액을 고친다 (앱 심볼은 앱 상태에서 자동 계산되므로 수정 대상이 아님)
  const saveEdit = (a: Asset) => {
    const n = Number(editVal);
    if (!Number.isFinite(n) || n < 0) { alert('올바른 숫자를 입력해 주세요.'); return; }
    save(assets.map(x => {
      if (x.id !== a.id) return x;
      if (x.coin) return { ...x, qty: n };
      if (x.usd != null) return { ...x, usd: n };
      return { ...x, krw: n };
    }));
    setEditId(null);
  };

  const add = () => {
    const id = Date.now().toString(36);
    const amt = Number(form.amt);
    let a: Asset;
    if (kind === 'sym') {
      a = { id, name: form.name || form.sym, cat: form.cat as Asset['cat'], sym: form.sym as Symbol };
    } else if (kind === 'coin') {
      // 거래소가 수량을 알려주면 그대로 넣는 쪽이 정확하다
      // (거래소마다 시세가 달라 금액으로 환산하면 김프/역프만큼 오차가 생긴다)
      if (coinMode === 'qty') {
        if (!amt) { alert('수량을 입력해 주세요.'); return; }
        const list0 = [...assets, { id, name: form.name || form.coin.replace('KRW-', ''), cat: '코인' as const, coin: form.coin, qty: amt }];
        save(list0); setForm({ ...form, name: '', amt: '' }); refresh(list0);
        return;
      }
      const px = market.coins[form.coin] ?? 0;
      if (!px) { alert('먼저 시세를 갱신해 주세요.'); return; }
      if (!amt) { alert('현재 평가금액을 입력해 주세요.'); return; }
      if (coinCur === 'USD' && !market.fx) { alert('환율을 받지 못했습니다. 시세를 갱신해 주세요.'); return; }
      // 입력은 금액으로 받고 수량으로 환산해 저장한다 (이후 시세 변동이 자동 반영됨)
      // 달러로 넣은 경우 환율로 원화 금액을 만든 뒤 나눈다
      const krwAmt = coinCur === 'USD' ? amt * market.fx : amt;
      a = { id, name: form.name || form.coin.replace('KRW-', ''), cat: '코인', coin: form.coin, qty: krwAmt / px };
    } else if (kind === 'krw') {
      if (!amt) { alert('금액을 입력해 주세요.'); return; }
      a = { id, name: form.name || '원화', cat: form.cat as Asset['cat'], krw: amt };
    } else {
      if (!amt) { alert('금액을 입력해 주세요.'); return; }
      a = { id, name: form.name || '달러', cat: form.cat as Asset['cat'], usd: amt };
    }
    const list = [...assets, a];
    save(list);
    setForm({ ...form, name: '', amt: '' });
    refresh(list);
  };

  if (!mounted) return null;

  const vals = assets.map(a => ({ a, v: valueOf(a, market) }));
  const total = vals.reduce((s, x) => s + x.v, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* 총자산 + 시세 갱신 */}
      <div className="border border-border rounded-lg p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">총 자산</span>
          <button onClick={() => refresh(assets)} disabled={loading}
            className="text-xs text-primary hover:underline disabled:opacity-40">
            {loading ? '조회 중…' : '시세 갱신'}
          </button>
        </div>
        <div className="text-2xl font-mono">{won(total)}</div>
        {market.fx > 0 && (
          <>
            <div className="text-sm font-mono text-muted-foreground">{usdOf(total, market.fx)}</div>
            <div className="text-xs text-muted-foreground/60 font-mono">환율 {market.fx.toFixed(2)}원</div>
          </>
        )}
      </div>

      {/* 카테고리별 비중 */}
      {CATS.map(cat => {
        const rows = vals.filter(x => x.a.cat === cat);
        if (!rows.length) return null;
        const sum = rows.reduce((s, x) => s + x.v, 0);
        const now = total > 0 ? (sum / total) * 100 : 0;
        const tgt = targets[cat];
        const gap = now - tgt;                 // 양수면 목표 초과 → 정리 대상
        const gapWon = (gap / 100) * total;
        return (
          <div key={cat} className="border border-border rounded-lg p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{cat}</span>
              <span className="font-mono text-sm">
                {pct(now)} <span className="text-xs text-muted-foreground">/ 목표 {tgt}%</span>
              </span>
            </div>
            {/* 비중 막대 — 목표선을 함께 표시해 초과·미달을 한눈에 본다 */}
            <div className="relative h-2 bg-muted rounded overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${Math.min(now, 100)}%` }} />
              <div className="absolute top-0 h-full w-px bg-foreground/50" style={{ left: `${Math.min(tgt, 100)}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.abs(gap) < 1
                ? '적정 수준'
                : gap > 0
                  ? <span className="text-destructive">{won(gapWon)} <span className="text-muted-foreground/60">{usdOf(gapWon, market.fx)}</span> 초과 — 정리 검토</span>
                  : <span>{won(-gapWon)} <span className="text-muted-foreground/60">{usdOf(-gapWon, market.fx)}</span> 여유 — 추가 여력</span>}
            </div>
            <div className="border-t border-border pt-2 flex flex-col gap-1">
              {rows.map(({ a, v }) => (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">
                    {a.name}
                    {/* 코인은 수량으로 저장되므로 실제 보유량과 대조할 수 있게 함께 보여준다 */}
                    {a.coin && a.qty != null && editId !== a.id && (
                      <span className="font-mono text-muted-foreground/60 ml-1.5">
                        {qtyFmt(a.qty)}
                      </span>
                    )}
                  </span>
                  {editId === a.id ? (
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <input type="number" value={editVal} autoFocus
                        onChange={e => setEditVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(a); if (e.key === 'Escape') setEditId(null); }}
                        className="w-36 bg-input border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-ring" />
                      <button onClick={() => saveEdit(a)} className="text-xs text-primary hover:underline shrink-0">저장</button>
                      <button onClick={() => setEditId(null)} className="text-xs text-muted-foreground hover:underline shrink-0">취소</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-mono text-xs">{won(v)}</div>
                        {market.fx > 0 && (
                          <div className="font-mono text-[10px] text-muted-foreground/60 leading-tight">{usdOf(v, market.fx)}</div>
                        )}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground/60 w-12 text-right">
                        {total > 0 ? pct((v / total) * 100) : '-'}
                      </span>
                      {/* 앱 심볼은 잔여자본·보유주식에서 자동 계산되므로 여기서 고치지 않는다 */}
                      {!a.sym && (
                        <button onClick={() => { setEditId(a.id); setEditVal(String(a.qty ?? a.usd ?? a.krw ?? '')); }}
                          className="text-xs text-primary hover:underline shrink-0">수정</button>
                      )}
                      <button onClick={() => { if (confirm(`${a.name} 삭제?`)) save(assets.filter(x => x.id !== a.id)); }}
                        className="text-xs text-destructive hover:underline shrink-0">삭제</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* 목표 비중 설정 */}
      <div className="border border-border rounded-lg p-4 flex flex-col gap-3">
        <span className="text-sm font-medium">목표 비중 (%)</span>
        <div className="grid grid-cols-3 gap-3">
          {CATS.map(cat => (
            <div key={cat}>
              <label className="block text-xs text-muted-foreground mb-1.5">{cat}</label>
              <input type="number" value={targets[cat]}
                onChange={e => {
                  const t = { ...targets, [cat]: Number(e.target.value) };
                  setTargetList(t); setTargets(t);
                }}
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
            </div>
          ))}
        </div>
        <span className="text-xs text-muted-foreground/60">
          합계 {CATS.reduce((s, c) => s + targets[c], 0)}%
        </span>
      </div>

      {/* 자산 추가 */}
      <div className="border border-border rounded-lg p-4 flex flex-col gap-3">
        <span className="text-sm font-medium">자산 추가</span>
        <div className="flex gap-1.5 bg-muted p-1 rounded-lg">
          {([['sym', '앱 심볼'], ['coin', '코인'], ['krw', '원화'], ['usd', '달러']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setKind(k)}
              className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-colors ${
                kind === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>{label}</button>
          ))}
        </div>

        {kind === 'sym' && (
          <select value={form.sym} onChange={e => setForm({ ...form, sym: e.target.value })}
            className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring">
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {kind === 'coin' && (
          <select value={form.coin} onChange={e => setForm({ ...form, coin: e.target.value })}
            className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring">
            {COINS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        )}
        {kind !== 'sym' && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              {kind === 'coin'
                ? (coinMode === 'qty' ? '보유 수량 — 거래소에 표시된 값을 그대로' : '현재 평가금액 — 수량으로 환산해 저장됩니다')
                : kind === 'krw' ? '금액 (원)' : '금액 ($)'}
            </label>
            {kind === 'coin' && (
              <div className="flex gap-1.5 bg-muted p-1 rounded-lg mb-1.5">
                {([['qty', '수량 직접'], ['amt', '금액으로']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setCoinMode(m)}
                    className={`flex-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      coinMode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}>{label}</button>
                ))}
              </div>
            )}
            {kind === 'coin' && coinMode === 'amt' && (
              <div className="flex gap-1.5 bg-muted p-1 rounded-lg mb-1.5">
                {(['KRW', 'USD'] as const).map(c => (
                  <button key={c} onClick={() => setCoinCur(c)}
                    className={`flex-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      coinCur === c ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}>{c === 'KRW' ? '원' : '달러 ($)'}</button>
                ))}
              </div>
            )}
            <input type="number" value={form.amt} onChange={e => setForm({ ...form, amt: e.target.value })}
              placeholder={kind === 'coin' && coinMode === 'qty' ? '예: 0.00593956'
                : kind === 'usd' || (kind === 'coin' && coinCur === 'USD') ? '예: 546' : '예: 4300000'}
              className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-ring" />
            {/* 달러로 입력할 때는 원화 환산액을 바로 보여줘 확인할 수 있게 한다 */}
            {kind === 'coin' && coinMode === 'amt' && coinCur === 'USD' && Number(form.amt) > 0 && market.fx > 0 && (
              <div className="text-xs text-muted-foreground/60 font-mono mt-1">
                ≈ {won(Number(form.amt) * market.fx)}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">표시 이름 (선택)</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="예: 업비트 BTC"
              className="w-full bg-input border border-border rounded px-3 py-2 text-sm outline-none focus:border-ring" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">분류</label>
            <select value={kind === 'coin' ? '코인' : form.cat} disabled={kind === 'coin'}
              onChange={e => setForm({ ...form, cat: e.target.value })}
              className="w-full bg-input border border-border rounded px-3 py-2 text-sm outline-none focus:border-ring disabled:opacity-50">
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <button onClick={add}
          className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity">
          추가
        </button>
      </div>
    </div>
  );
}

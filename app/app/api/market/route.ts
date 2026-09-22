import { NextRequest, NextResponse } from 'next/server'
import { fetchPrice } from '@/lib/toss'

// 포트폴리오 평가에 필요한 시세를 한 번에 조회한다
//   fx     : 원/달러 환율 (Yahoo Finance)
//   coins  : 업비트 원화 마켓 시세
//   stocks : 토스증권 주식 현재가
export async function GET(req: NextRequest) {
  const coins = req.nextUrl.searchParams.get('coins')
  const stocks = req.nextUrl.searchParams.get('stocks')

  const out: { fx: number; coins: Record<string, number>; stocks: Record<string, number> } = {
    fx: 0, coins: {}, stocks: {},
  }

  // 환율 — 실패해도 전체를 막지 않고 0으로 두어 화면에서 수동값을 쓰게 한다
  try {
    const r = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }
    )
    const j = await r.json()
    out.fx = j.chart.result[0].meta.regularMarketPrice
  } catch { /* 환율 조회 실패는 무시 */ }

  // 업비트 코인 시세 (한 번의 호출로 여러 마켓 조회 가능)
  if (coins) {
    try {
      const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${coins}`, { cache: 'no-store' })
      const j: { market: string; trade_price: number }[] = await r.json()
      for (const d of j) out.coins[d.market] = d.trade_price
    } catch { /* 코인 시세 실패는 무시 */ }
  }

  // 토스 주식 시세 — 심볼마다 호출이 필요하므로 병렬 처리
  if (stocks) {
    const list = stocks.split(',').filter(Boolean)
    const rs = await Promise.allSettled(list.map(s => fetchPrice(s)))
    rs.forEach((r, i) => {
      // fetchPrice는 문자열을 돌려주므로 숫자로 바꾸고, 변환 실패(NaN)는 버린다
      if (r.status !== 'fulfilled') return
      const p = Number(r.value)
      if (Number.isFinite(p)) out.stocks[list[i]] = p
    })
  }

  return NextResponse.json(out)
}

import { NextRequest, NextResponse } from 'next/server'
import { fetchHoldings } from '@/lib/toss'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: '심볼이 필요합니다' }, { status: 400 })
  try {
    const result = await fetchHoldings(symbol)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

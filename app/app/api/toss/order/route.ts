import { NextRequest, NextResponse } from 'next/server'
import { createOrder, fetchOpenOrders } from '@/lib/toss'
import type { OrderParams } from '@/lib/toss'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: '심볼이 필요합니다' }, { status: 400 })
  try {
    const orders = await fetchOpenOrders(symbol)
    return NextResponse.json({ orders })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const params = await req.json() as OrderParams
    if (!params.symbol || !params.side || !params.quantity || !params.price) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다' }, { status: 400 })
    }
    const result = await createOrder(params)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

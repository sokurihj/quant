import { NextRequest, NextResponse } from 'next/server'
import { fetchPrice } from '@/lib/toss'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: '심볼이 필요합니다' }, { status: 400 })

  const hasId = !!process.env.TOSS_CLIENT_ID
  const hasSecret = !!process.env.TOSS_CLIENT_SECRET

  try {
    const price = await fetchPrice(symbol)
    return NextResponse.json({ price })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message, debug: { hasId, hasSecret } }, { status: 500 })
  }
}

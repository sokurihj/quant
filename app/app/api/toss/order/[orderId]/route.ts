import { NextRequest, NextResponse } from 'next/server'
import { cancelOrder } from '@/lib/toss'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  try {
    await cancelOrder(orderId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

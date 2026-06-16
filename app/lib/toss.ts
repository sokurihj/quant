const TOSS_BASE = 'https://openapi.tossinvest.com'
const PROXY_URL = process.env.TOSS_PROXY_URL
const PROXY_SECRET = process.env.PROXY_SECRET

const SYMBOL_MAP: Record<string, string> = {
  HYNIX2X: '0195S0',
}

function toTossSymbol(symbol: string): string {
  return SYMBOL_MAP[symbol] ?? symbol
}

let cachedToken: { value: string; expiresAt: number } | null = null
let cachedAccountSeq: number | null = null

async function getAccountSeq(token: string): Promise<number> {
  if (cachedAccountSeq !== null) return cachedAccountSeq
  const res = await fetch(`${TOSS_BASE}/api/v1/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`계좌 조회 실패: ${res.status}`)
  const data = await res.json() as { result: { accountSeq: number; accountType: string }[] }
  const account = data.result?.find(a => a.accountType === 'BROKERAGE') ?? data.result?.[0]
  if (!account) throw new Error('계좌를 찾을 수 없습니다')
  cachedAccountSeq = account.accountSeq
  return cachedAccountSeq
}

export interface HoldingsResult {
  quantity: number
  averagePurchasePrice: number
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }

  const res = await fetch(`${TOSS_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.TOSS_CLIENT_ID!,
      client_secret: process.env.TOSS_CLIENT_SECRET!,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`토스 토큰 발급 실패: ${res.status} / ${body}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.value
}

function proxyHeaders(): Record<string, string> {
  return PROXY_SECRET ? { Authorization: `Bearer ${PROXY_SECRET}` } : {}
}

export async function fetchPrice(symbol: string): Promise<string> {
  const tossSymbol = toTossSymbol(symbol)
  if (PROXY_URL) {
    const res = await fetch(`${PROXY_URL}/price?symbol=${encodeURIComponent(tossSymbol)}`, {
      headers: proxyHeaders(),
    })
    if (!res.ok) throw new Error(`현재가 조회 실패: ${res.status}`)
    const { price } = await res.json() as { price: string }
    return price
  }

  const token = await getToken()
  const res = await fetch(`${TOSS_BASE}/api/v1/prices?symbols=${encodeURIComponent(tossSymbol)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error(`현재가 조회 실패: ${res.status}`)

  const data = await res.json() as { result: { symbol: string; lastPrice: string }[] }
  const item = data.result[0]
  if (!item) throw new Error(`심볼을 찾을 수 없습니다: ${symbol}`)
  return parseFloat(item.lastPrice).toFixed(2)
}

export async function fetchHoldings(symbol: string): Promise<HoldingsResult> {
  const tossSymbol = toTossSymbol(symbol)
  if (PROXY_URL) {
    const res = await fetch(`${PROXY_URL}/holdings?symbol=${encodeURIComponent(tossSymbol)}`, {
      headers: proxyHeaders(),
    })
    if (!res.ok) throw new Error(`보유주식 조회 실패: ${res.status}`)
    const data = await res.json() as { quantity: string; averagePurchasePrice: string }
    return { quantity: parseFloat(data.quantity), averagePurchasePrice: parseFloat(data.averagePurchasePrice) }
  }

  const token = await getToken()
  const accountSeq = await getAccountSeq(token)
  const res = await fetch(`${TOSS_BASE}/api/v1/holdings?symbol=${encodeURIComponent(tossSymbol)}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tossinvest-Account': String(accountSeq) },
  })
  if (!res.ok) throw new Error(`보유주식 조회 실패: ${res.status}`)
  const data = await res.json() as { result: { items: { quantity: string; averagePurchasePrice: string }[] } }
  const item = data.result?.items?.[0]
  return {
    quantity: item ? parseFloat(item.quantity) : 0,
    averagePurchasePrice: item ? parseFloat(item.averagePurchasePrice) : 0,
  }
}

export interface OrderParams {
  symbol: string
  side: 'BUY' | 'SELL'
  orderType: 'LIMIT'
  timeInForce?: 'CLS'
  quantity: string
  price: string
  clientOrderId?: string
}

export async function createOrder(params: OrderParams): Promise<unknown> {
  const tossSymbol = toTossSymbol(params.symbol)
  const body = { ...params, symbol: tossSymbol }

  if (PROXY_URL) {
    const res = await fetch(`${PROXY_URL}/order`, {
      method: 'POST',
      headers: { ...proxyHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json() as { message?: string; error?: string }
    if (!res.ok) throw new Error(data.message ?? data.error ?? `주문 실패: ${res.status}`)
    return data
  }

  const token = await getToken()
  const accountSeq = await getAccountSeq(token)
  const res = await fetch(`${TOSS_BASE}/api/v1/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tossinvest-Account': String(accountSeq),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json() as { message?: string; error?: { message?: string } | string }
  if (!res.ok) {
    const err = data.error
    const msg = typeof err === 'object' ? err?.message : err ?? data.message ?? `주문 실패: ${res.status}`
    throw new Error(msg)
  }
  return data
}

export interface OpenOrder {
  orderId: string
  symbol: string
  side: 'BUY' | 'SELL'
  orderType: 'LIMIT'
  timeInForce?: 'CLS'
  quantity: string
  price: string
  clientOrderId?: string
}

export async function fetchOpenOrders(symbol: string): Promise<OpenOrder[]> {
  const tossSymbol = toTossSymbol(symbol)
  if (PROXY_URL) {
    const res = await fetch(`${PROXY_URL}/orders?symbol=${encodeURIComponent(tossSymbol)}`, {
      headers: proxyHeaders(),
    })
    if (!res.ok) throw new Error(`미체결 주문 조회 실패: ${res.status}`)
    const data = await res.json() as { orders: OpenOrder[] }
    return data.orders ?? []
  }

  const token = await getToken()
  const accountSeq = await getAccountSeq(token)
  const res = await fetch(`${TOSS_BASE}/api/v1/orders?status=OPEN`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tossinvest-Account': String(accountSeq) },
  })
  if (!res.ok) throw new Error(`미체결 주문 조회 실패: ${res.status}`)
  const data = await res.json() as { result: { orders: OpenOrder[] } }
  const items = data.result?.orders ?? []
  return items.filter(o => o.symbol === tossSymbol)
}

export async function cancelOrder(orderId: string): Promise<void> {
  if (PROXY_URL) {
    const res = await fetch(`${PROXY_URL}/order/${orderId}`, {
      method: 'DELETE',
      headers: proxyHeaders(),
    })
    const data = await res.json() as { error?: string }
    if (!res.ok) throw new Error(data.error ?? `취소 실패: ${res.status}`)
    return
  }

  const token = await getToken()
  const accountSeq = await getAccountSeq(token)
  const res = await fetch(`${TOSS_BASE}/api/v1/orders/${orderId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'X-Tossinvest-Account': String(accountSeq) },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: { message?: string } | string }
    const err = data.error
    const msg = typeof err === 'object' ? err?.message : err ?? `취소 실패: ${res.status}`
    throw new Error(msg)
  }
}

export async function fetchFiveDayAvg(symbol: string): Promise<string> {
  const tossSymbol = toTossSymbol(symbol)
  if (PROXY_URL) {
    const res = await fetch(`${PROXY_URL}/candles?symbol=${encodeURIComponent(tossSymbol)}`, {
      headers: proxyHeaders(),
    })
    if (!res.ok) throw new Error(`캔들 조회 실패: ${res.status}`)
    const { avg } = await res.json() as { avg: string }
    return avg
  }

  const token = await getToken()
  const res = await fetch(
    `${TOSS_BASE}/api/v1/candles?symbol=${encodeURIComponent(tossSymbol)}&interval=1d&count=6`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!res.ok) throw new Error(`캔들 조회 실패: ${res.status}`)

  const data = await res.json() as { result: { candles: { closePrice: string }[] } }
  const candles = data.result.candles.slice(1) // 오늘(미완성) 제외
  if (!candles.length) throw new Error('캔들 데이터 없음')
  const avg = candles.reduce((sum, c) => sum + parseFloat(c.closePrice), 0) / candles.length
  return avg.toFixed(2)
}

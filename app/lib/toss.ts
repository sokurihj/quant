const BASE = 'https://openapi.tossinvest.com'

let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }

  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.TOSS_CLIENT_ID!,
      client_secret: process.env.TOSS_CLIENT_SECRET!,
    }),
  })

  if (!res.ok) throw new Error(`토스 토큰 발급 실패: ${res.status}`)

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.value
}

export async function fetchPrice(symbol: string): Promise<string> {
  const token = await getToken()
  const res = await fetch(`${BASE}/api/v1/prices?symbols=${encodeURIComponent(symbol)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error(`현재가 조회 실패: ${res.status}`)

  const data = await res.json() as { result: { symbol: string; lastPrice: string }[] }
  const item = data.result[0]
  if (!item) throw new Error(`심볼을 찾을 수 없습니다: ${symbol}`)
  return parseFloat(item.lastPrice).toFixed(2)
}

export async function fetchFiveDayAvg(symbol: string): Promise<string> {
  const token = await getToken()
  const res = await fetch(
    `${BASE}/api/v1/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=6`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!res.ok) throw new Error(`캔들 조회 실패: ${res.status}`)

  const data = await res.json() as { result: { candles: { closePrice: string }[] } }
  const candles = data.result.candles.slice(1) // 오늘(미완성) 제외
  if (!candles.length) throw new Error('캔들 데이터 없음')
  const avg = candles.reduce((sum, c) => sum + parseFloat(c.closePrice), 0) / candles.length
  return avg.toFixed(2)
}

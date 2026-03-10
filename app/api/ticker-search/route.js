import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  if (!query || query.length < 2) return NextResponse.json([])

  try {
    const results = await yahooFinance.search(query, {
      newsCount: 0,
      quotesCount: 8,
    })
    const quotes = (results.quotes || [])
      .filter(q => q.symbol && (q.shortname || q.longname))
      .slice(0, 6)
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.typeDisp || q.quoteType || '',
        exchange: q.exchange || '',
      }))
    return NextResponse.json(quotes)
  } catch (err) {
    console.error('Ticker search error:', err.message)
    return NextResponse.json([])
  }
}

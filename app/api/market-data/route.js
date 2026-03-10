import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()

export async function POST(request) {
  const { symbol } = await request.json()

  try {
    const [quote, quoteSummary, historicalData] = await Promise.all([
      yahooFinance.quote(symbol),
      yahooFinance.quoteSummary(symbol, {
        modules: ['summaryDetail', 'financialData', 'recommendationTrend']
      }),
      yahooFinance.historical(symbol, {
        period1: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        interval: '1d'
      }).catch(() => null)
    ])

    const trend = quoteSummary?.recommendationTrend?.trend?.[0]
    const strongBuy = trend?.strongBuy || 0
    const buy = trend?.buy || 0
    const hold = trend?.hold || 0
    const sell = trend?.sell || 0
    const strongSell = trend?.strongSell || 0
    const totalRatings = strongBuy + buy + hold + sell + strongSell
    const bullish = strongBuy + buy
    const bearish = sell + strongSell

    let analystRating = 'Hold'
    if (totalRatings > 0) {
      if (bullish / totalRatings > 0.5) analystRating = 'Buy'
      else if (bearish / totalRatings > 0.3) analystRating = 'Sell'
    }

    return NextResponse.json({
      price: quote.regularMarketPrice,
      change: quote.regularMarketChangePercent,
      low52: quote.fiftyTwoWeekLow,
      high52: quote.fiftyTwoWeekHigh,
      volume: quote.regularMarketVolume,
      marketCap: quote.marketCap,
      analystTarget: quoteSummary?.financialData?.targetMeanPrice || null,
      analystRating,
      analystBuy: bullish,
      analystHold: hold,
      analystSell: bearish,
      name: quote.longName || quote.shortName || quote.displayName || symbol,
      iv: (() => {
        if (!historicalData || historicalData.length < 2) return null
        const prices = historicalData.slice(-31).map(d => d.close).filter(Boolean)
        if (prices.length < 2) return null
        const returns = []
        for (let i = 1; i < prices.length; i++) {
          returns.push(Math.log(prices[i] / prices[i - 1]))
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length
        const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
        return Math.round(Math.sqrt(variance * 252) * 100 * 10) / 10
      })(),
      live: true,
    })
  } catch (error) {
    console.error('Yahoo Finance error:', symbol, error.message)
    return NextResponse.json({ error: 'MARKET_DATA_FAILED', message: error.message }, { status: 500 })
  }
}

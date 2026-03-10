import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()

export async function POST(request) {
  const { symbol } = await request.json()

  try {
    const [quote, quoteSummary, optionsData] = await Promise.all([
      yahooFinance.quote(symbol),
      yahooFinance.quoteSummary(symbol, {
        modules: ['summaryDetail', 'financialData', 'recommendationTrend']
      }),
      yahooFinance.options(symbol).catch(() => null)
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
        if (!optionsData?.options?.[0]) return null
        const currentPrice = quote.regularMarketPrice
        const chain = [...(optionsData.options[0].calls || []), ...(optionsData.options[0].puts || [])]
          .filter(o => o.impliedVolatility != null)
        if (!chain.length) return null
        const atm = chain.reduce((best, opt) =>
          Math.abs(opt.strike - currentPrice) < Math.abs(best.strike - currentPrice) ? opt : best
        )
        return atm?.impliedVolatility ? Math.round(atm.impliedVolatility * 100 * 10) / 10 : null
      })(),
      live: true,
    })
  } catch (error) {
    console.error('Yahoo Finance error:', symbol, error.message)
    return NextResponse.json({ error: 'MARKET_DATA_FAILED', message: error.message }, { status: 500 })
  }
}

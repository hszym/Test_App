import { NextResponse } from 'next/server'

const SG_BASE = 'https://sp-api.sgmarkets.com'
const SG_TOKEN_URL = 'https://sso.sgmarkets.com/sgconnect/oauth2/access_token'

const PRODUCT_CONFIG = {
  rc:       { productType: 'ReverseConvertible', productSubtype: 'BarrierReverseConvertible', solvingMode: 'RecallCoupon', wrapper: 'Note' },
  snowball: { productType: 'Autocall',            productSubtype: 'Phoenix',                  solvingMode: 'RecallCoupon', wrapper: 'Note' },
  bonus:    { productType: 'Participation',       productSubtype: 'BonusCertificate',         solvingMode: 'Bonus',        wrapper: 'Note' },
  cpn:      { productType: 'Participation',       productSubtype: 'CUOSingle',                solvingMode: 'CapLevel',     wrapper: 'Note' },
}

async function getSGToken() {
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.SG_CLIENT_ID,
    client_secret: process.env.SG_CLIENT_SECRET,
    scope:         'api.sgmarkets-execution-structured-products.v1',
  })
  const res = await fetch(SG_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SG auth failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('SG auth response missing access_token')
  return data.access_token
}

export async function POST(request) {
  const { productType, underlyings, maturityMonths, barrier, currency } = await request.json()

  if (!process.env.SG_CLIENT_ID || !process.env.SG_CLIENT_SECRET) {
    return NextResponse.json({ error: 'SG_CLIENT_ID / SG_CLIENT_SECRET not configured' }, { status: 500 })
  }

  const config = PRODUCT_CONFIG[productType]
  if (!config) {
    return NextResponse.json({ error: `Unknown product type: ${productType}` }, { status: 400 })
  }

  if (!underlyings?.length) {
    return NextResponse.json({ error: 'No underlyings provided' }, { status: 400 })
  }

  try {
    const token = await getSGToken()

    // Map ticker symbols to Bloomberg format.
    // US equities: "AAPL US Equity". Adjust idType/id for non-US if needed.
    const underlyingPayload = underlyings.map(sym => ({
      id:     `${sym} US Equity`,
      idType: 'Bloomberg',
    }))

    const quotePayload = {
      ...config,
      currency,
      maturity:    { months: maturityMonths },
      underlyings: underlyingPayload,
      barrier,
    }

    console.log('SG quote request:', JSON.stringify(quotePayload))

    const quoteRes = await fetch(`${SG_BASE}/api/v1/quotes`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(quotePayload),
    })

    if (!quoteRes.ok) {
      const errBody = await quoteRes.text()
      throw new Error(`SG quote request failed (${quoteRes.status}): ${errBody}`)
    }

    const { QuoteId } = await quoteRes.json()
    if (!QuoteId) throw new Error('SG response did not return a QuoteId')

    console.log('SG QuoteId:', QuoteId)

    // Poll every 2 s, max 10 attempts (20 s total)
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 2000))

      const pollRes = await fetch(`${SG_BASE}/api/v1/quote/${QuoteId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!pollRes.ok) {
        console.warn(`SG poll attempt ${attempt + 1} returned ${pollRes.status}`)
        continue
      }

      const quote = await pollRes.json()
      console.log(`SG poll attempt ${attempt + 1}:`, quote.Status)

      if (quote.Status === 'Quoted') {
        // Extract solved value — field name varies by solvingMode
        const value =
          quote.SolvedValue  ??
          quote.RecallCoupon ??
          quote.Bonus        ??
          quote.CapLevel     ??
          quote.Value        ??
          null

        if (value === null) {
          throw new Error('SG returned Quoted status but no recognisable solved value field')
        }
        return NextResponse.json({ value, quoteId: QuoteId })
      }

      if (quote.Status === 'Error' || quote.Status === 'Failed' || quote.Status === 'Rejected') {
        throw new Error(`SG quote ${quote.Status}: ${quote.ErrorMessage || 'no details'}`)
      }
    }

    throw new Error('SG quote timed out — no result after 20 seconds')
  } catch (error) {
    console.error('SG Markets API error:', error)
    return NextResponse.json({ error: error.message || 'SG pricing failed' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'

const SG_BASE = 'https://sp-api.sgmarkets.com'

const PRODUCT_CONFIG = {
  rc:       { productType: 'ReverseConvertible', productSubtype: 'BarrierReverseConvertible', solvingMode: 'RecallCoupon', wrapper: 'Note' },
  snowball: { productType: 'Autocall',            productSubtype: 'Phoenix',                  solvingMode: 'RecallCoupon', wrapper: 'Note' },
  bonus:    { productType: 'Participation',       productSubtype: 'BonusCertificate',         solvingMode: 'Bonus',        wrapper: 'Note' },
  cpn:      { productType: 'Participation',       productSubtype: 'CUOSingle',                solvingMode: 'CapLevel',     wrapper: 'Note' },
}

async function getSGToken() {
  const tokenResponse = await fetch(
    'https://sso.sgmarkets.com/sgconnect/oauth2/access_token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.SG_CLIENT_ID,
        client_secret: process.env.SG_CLIENT_SECRET,
        scope: 'api.sgmarkets-execution-structured-products.v1',
      }).toString(),
    }
  )
  const tokenData = await tokenResponse.json()
  console.log('SG token response:', JSON.stringify(tokenData))
  if (!tokenResponse.ok || !tokenData.access_token) {
    return NextResponse.json({ error: 'SG_AUTH_FAILED', detail: tokenData }, { status: 401 })
  }
  return tokenData.access_token
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

    // TEST: probe underlying-universe before attempting a quote
    const testResponse = await fetch(
      'https://sp-api.sgmarkets.com/api/v1/underlying-universe',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    )
    const testData = await testResponse.json()
    console.log('SG universe test status:', testResponse.status)
    console.log('SG universe test response:', JSON.stringify(testData).slice(0, 500))

    return NextResponse.json({
      tokenOk: true,
      universeStatus: testResponse.status,
      universeData: testData,
    })

    // Use the bare-minimum payload format from SG docs
    const quotePayload = {
      variationParameters: {
        ...config,
        underlying: underlyings.map(sym => ({ id: `${sym} UW`, idType: 'Bloomberg' })),
        maturityValue: {
          currentValue: { value: maturityMonths, unit: 'Month' },
        },
        currency,
        notionalAmount: 1000000,
        strike: 100,
        kiBarrier: barrier,
        recallThreshold: 100,
        couponFrequency: 'FourPerYear',
        recallStartPeriod: 1,
      },
    }

    const quoteUrl = `${SG_BASE}/api/v1/quotes`
    const quoteHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    console.log('SG request URL:', quoteUrl)
    console.log('SG request headers:', JSON.stringify(quoteHeaders))
    console.log('SG request body:', JSON.stringify(quotePayload))

    const quoteRes = await fetch(quoteUrl, {
      method: 'POST',
      headers: quoteHeaders,
      body: JSON.stringify(quotePayload),
    })

    const quoteResText = await quoteRes.text()
    console.log('SG quote response status:', quoteRes.status)
    console.log('SG quote response body:', quoteResText)

    if (!quoteRes.ok) {
      throw new Error(`SG quote request failed (${quoteRes.status}): ${quoteResText}`)
    }

    let quoteResData
    try { quoteResData = JSON.parse(quoteResText) } catch { throw new Error(`SG quote non-JSON response: ${quoteResText}`) }

    const QuoteId = quoteResData.QuoteId
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

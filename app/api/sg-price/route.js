import { NextResponse } from 'next/server'

const SG_BASE = 'https://sp-api.sgmarkets.com'

const PRODUCT_CONFIG = {
  rc:       { productType: 'ReverseConvertible', productSubtype: 'BarrierReverseConvertible', solvingMode: 'RecallCoupon', wrapper: 'Note' },
  snowball: { productType: 'Autocall',            productSubtype: 'Phoenix',                  solvingMode: 'RecallCoupon', wrapper: 'Note' },
  bonus:    { productType: 'Participation',       productSubtype: 'BonusCertificate',         solvingMode: 'Bonus',        wrapper: 'Note' },
  cpn:      { productType: 'Participation',       productSubtype: 'CUOSingle',                solvingMode: 'CapLevel',     wrapper: 'Note' },
}

export async function POST(request) {
  const { productType, params, sgToken } = await request.json()

  if (!sgToken) {
    return NextResponse.json({ error: 'SG_TOKEN_MISSING' }, { status: 401 })
  }

  const config = PRODUCT_CONFIG[productType]
  if (!config) {
    return NextResponse.json({ error: `Unknown product type: ${productType}` }, { status: 400 })
  }

  const headers = {
    'Authorization': `Bearer ${sgToken}`,
    'Content-Type': 'application/json',
  }

  const quoteRes = await fetch(`${SG_BASE}/api/v1/quotes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ variationParameters: { ...config, ...params } }),
  })

  const quoteData = await quoteRes.json()
  console.log('SG quote response:', quoteRes.status, JSON.stringify(quoteData))

  if (!quoteRes.ok) {
    return NextResponse.json({
      error: `SG quote failed (${quoteRes.status})`,
      detail: quoteData,
    }, { status: quoteRes.status })
  }

  const quoteId = quoteData.QuoteId
  if (!quoteId) {
    return NextResponse.json({ error: 'SG did not return a QuoteId', detail: quoteData }, { status: 502 })
  }

  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const resultRes = await fetch(`${SG_BASE}/api/v1/quote/${quoteId}`, { headers })
    const result = await resultRes.json()
    console.log(`Poll ${i + 1}:`, result.Status, JSON.stringify(result).slice(0, 200))

    if (result.Status === 'Quoted') {
      const value = result.SolvedValue ?? result.RecallCoupon ?? result.Bonus ?? result.CapLevel ?? result.Value ?? null
      if (value === null) {
        return NextResponse.json({ error: 'SG returned Quoted status but no solved value field', detail: result }, { status: 502 })
      }
      return NextResponse.json({ success: true, value, data: result })
    }
    if (['Error', 'Failed', 'Rejected'].includes(result.Status)) {
      return NextResponse.json({ error: `SG quote ${result.Status}`, detail: result }, { status: 502 })
    }
  }

  return NextResponse.json({ error: 'SG pricing timeout' }, { status: 408 })
}

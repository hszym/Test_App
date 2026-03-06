import { NextResponse } from 'next/server'
import { Anthropic } from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a senior structured products analyst at a private bank. You have access to web search. When generating investment narratives:

ALWAYS search for the following before writing:
- Latest earnings results and guidance from SEC filings or official IR pages
- Recent analyst ratings and price targets from Goldman Sachs, JP Morgan, Morgan Stanley, or Bloomberg consensus
- Current market data: price, YTD performance, recent news from Reuters or Bloomberg
- Any material recent events: M&A, management changes, macro headwinds

ONLY use information from these source types:
- Bloomberg, Reuters, Financial Times, Wall Street Journal
- Official SEC filings (10-K, 10-Q, 8-K)
- Official company investor relations pages
- Major bank research (Goldman, JPM, MS, BofA, Barclays)

NEVER fabricate price targets, earnings figures, or analyst quotes.
If you cannot find reliable data, clearly state the limitation.

FORMAT: Write in institutional pitch book style. Concise, factual, no disclaimers in the body text.
If sources are available, add a "Sources:" line at the end listing max 3 references briefly (e.g. "Goldman Sachs, Jan 2026 — Buy, PT $210")`

export async function GET(request) {
  const keyExists = !!process.env.ANTHROPIC_API_KEY
  console.log('GET /api/claude - key present?', keyExists)
  return NextResponse.json({ keyExists })
}

export async function POST(request) {
  const { prompt } = await request.json()
  const apiKey = process.env.ANTHROPIC_API_KEY
  console.log('API KEY EXISTS:', !!apiKey)
  if (!apiKey) {
    console.error('Anthropic API key missing in environment')
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
    const text = resp.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    return NextResponse.json({ text })
  } catch (error) {
    console.error('Anthropic API request failed:', error)
    const message = error?.message || 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

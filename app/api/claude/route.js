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
  const { prompt, noWebSearch } = await request.json()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const client = new Anthropic({ apiKey })
    const createParams = {
      model: 'claude-sonnet-4-6',
      max_tokens: noWebSearch ? 1024 : 2048,
      messages: [{ role: 'user', content: prompt }],
    }
    if (!noWebSearch) {
      createParams.system = SYSTEM_PROMPT
      createParams.tools = [{ type: 'web_search_20250305', name: 'web_search' }]
    }
    const resp = await client.messages.create(createParams)
    const text = resp.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    return NextResponse.json({ text })
  } catch (error) {
    console.error('Anthropic API request failed:', error)
    return NextResponse.json({ error: error?.message || 'Unknown error' }, { status: 500 })
  }
}

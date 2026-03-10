import { NextResponse } from 'next/server'
import { Anthropic } from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a senior structured products analyst at a private bank.
You write clean, institutional-grade investment prose.

ABSOLUTE FORMATTING RULES — never break these:
- Never start your response with an introduction like "Here is..." or "The following..."
- Never include titles, headers, or section labels of any kind
- Never use markdown: no ##, no **, no *, no ---
- Never include a Sources section or references at the end
- Never use em-dashes (—) to introduce clauses mid-sentence
- Never use emoji
- Start directly with the content requested

BULLET POINTS — only when explicitly requested in the prompt:
- Use clean bullet points with a simple hyphen (-)
- Each bullet should be one complete, concise sentence
- No sub-bullets
- No bold inside bullets`

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

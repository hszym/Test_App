import { NextResponse } from 'next/server'
import { Anthropic } from '@anthropic-ai/sdk'

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
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
    const text = resp.content?.[0]?.text || ''
    return NextResponse.json({ text })
  } catch (error) {
    console.error('Anthropic API request failed:', error)
    const message = error?.message || 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
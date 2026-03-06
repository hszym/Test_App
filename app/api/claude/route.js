import { NextResponse } from 'next/server'

export async function POST(request) {
  const { prompt } = await request.json()
  const apiKey = process.env.ANTHROPIC_API_KEY
  console.log('API KEY EXISTS:', !!apiKey)
  if (!apiKey) {
    console.error('Anthropic API key missing in environment')
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || 'Anthropic API error')
    }

    return NextResponse.json({ text: data.content[0].text })
  } catch (error) {
    console.error('Anthropic API request failed:', error)
    const message = error?.message || 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
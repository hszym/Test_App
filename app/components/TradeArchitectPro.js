'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF']
const TENORS = ['12M', '18M', '24M', '36M']
const RC_STRIKES = ['50%', '60%', '70%', '80%']
const SNOWBALL_BARRIERS = ['50/5%', '60/6%', '70/7%', '80/8%']
const BONUS_BARRIERS = ['50%', '60%', '70%', '80%']
const BONUS_CAPS = { '12M': '125%', '18M': '137.5%', '24M': '150%', '36M': '175%' }
const CPN_PROTECTIONS = ['85%', '90%', '95%', '100%']

const MOCK_DATA = {
  AAPL: { price: 189.84, change: 1.23, low52: 164.08, high52: 199.62, iv: 28.4 },
  MSFT: { price: 415.32, change: -0.45, low52: 309.45, high52: 430.82, iv: 24.1 },
  NVDA: { price: 875.40, change: 3.18, low52: 430.00, high52: 974.00, iv: 52.3 },
  TSLA: { price: 175.22, change: -2.10, low52: 138.80, high52: 299.29, iv: 61.8 },
  AMZN: { price: 198.10, change: 0.87, low52: 151.61, high52: 201.20, iv: 31.2 },
  GOOGL: { price: 172.63, change: 0.52, low52: 120.21, high52: 180.25, iv: 27.9 },
  META:  { price: 526.86, change: 1.95, low52: 279.40, high52: 542.81, iv: 35.6 },
  NESN:  { price: 94.22, change: -0.31, low52: 86.00, high52: 110.80, iv: 18.2 },
  ASML:  { price: 870.55, change: 2.41, low52: 560.00, high52: 1000.00, iv: 34.5 },
}

const DEFAULT_STATE = {
  step: 1,
  bankName: 'Plurimi Wealth Monaco',
  clientName: '',
  clientEmail: '',
  disclaimer: 'This document is for informational purposes only and does not constitute investment advice. Past performance is not indicative of future results. Capital is at risk.',
  tickers: [
    { symbol: 'AAPL', currency: 'USD', data: null, loading: false, bullCase: '', bearCase: '', entryNote: '' },
    { symbol: 'NVDA', currency: 'USD', data: null, loading: false, bullCase: '', bearCase: '', entryNote: '' },
    { symbol: '', currency: 'USD', data: null, loading: false, bullCase: '', bearCase: '', entryNote: '' },
  ],
  thesis: '',
  basketDynamics: '',
  productRows: [
    { key: 'Maturity', val: '24 Months' },
    { key: 'Worst-of (WO) Barrier', val: '70%' },
    { key: 'Autocall Barrier', val: '100%' },
    { key: 'Protection Barrier', val: '60%' },
    { key: 'Coupon Barrier', val: '70%' },
    { key: 'Coupon / Call Premium', val: '8.50% p.a.' },
    { key: 'Upside Participation', val: '100%' },
    { key: 'Cap', val: 'N/A' },
  ],
  pricingGrids: {
    rc: Array(4).fill(null).map(() => Array(4).fill('')),
    snowball: Array(4).fill(null).map(() => Array(4).fill('')),
    bonus: Array(4).fill(null).map(() => Array(4).fill('')),
    cpn: Array(4).fill(null).map(() => Array(4).fill('')),
  },
  showGrids: { rc: true, snowball: true, bonus: true, cpn: true },
  pricingCurrency: 'USD',
  aiLoading: {},
  aiMode: {},
}

// ─── AI CALL — hits our own secure Next.js API route, not Anthropic directly ─
async function callClaude(prompt) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.text || ''
}

function pos52w(price, low, high) {
  if (!price || !low || !high || high === low) return 50
  return Math.round(((price - low) / (high - low)) * 100)
}

function fmt(n, dec = 2) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

async function fetchMarketData(symbol) {
  await new Promise(r => setTimeout(r, 600 + Math.random() * 400))
  const key = symbol.toUpperCase()
  if (MOCK_DATA[key]) return { ...MOCK_DATA[key] }
  return { price: 100 + Math.random() * 200, change: (Math.random() - 0.5) * 4, low52: 80 + Math.random() * 40, high52: 160 + Math.random() * 80, iv: 20 + Math.random() * 30 }
}

function downloadHTML(htmlContent, clientName) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = `Plurimi_TradeIdea_${clientName || 'Client'}_${date}.html`;
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF(state) {
  // open a new window containing the HTML and auto-print
  const html = buildHTMLExport(state);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Popup blocked. Please allow popups for this site.');
    return;
  }
  printWindow.document.write(html + "<script>window.onload = function(){window.print();};<\/script>");
  printWindow.document.close();
}

function asciiTable(title, rowLabels, colLabels, grid) {
  const colW = 10, rowW = 16
  const sep = '+' + '-'.repeat(rowW) + colLabels.map(() => '+' + '-'.repeat(colW)).join('') + '+'
  let out = title + '\n' + sep + '\n'
  out += '|' + ''.padEnd(rowW) + colLabels.map(c => '|' + c.padEnd(colW)).join('') + '|\n' + sep + '\n'
  rowLabels.forEach((r, ri) => {
    out += '|' + r.padEnd(rowW) + colLabels.map((_, ci) => '|' + (grid?.[ri]?.[ci] || '—').padEnd(colW)).join('') + '|\n'
  })
  return out + sep + '\n'
}

function buildHTMLExport(state) {
  const activeTickers = state.tickers.filter(t => t.symbol && t.data)
  const dateStr = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })

  const gridHTML = (label, rowLabels, colLabels, grid, caps) => {
    const headerCells = colLabels.map(c => `<th>${c}</th>`).join('')
    const rows = rowLabels.map((r, ri) =>
      `<tr class="${ri % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="row-label">${r}</td>
        ${colLabels.map((c, ci) =>
          `<td>${grid?.[ri]?.[ci] || '\u2014'}${caps ? `<br/><span class="cap-note">Cap ${caps[c]}</span>` : ''}</td>`
        ).join('')}
      </tr>`
    ).join('')
    return `<table class="pg-table"><thead><tr><th class="row-label-head">${label}</th>${headerCells}</tr></thead><tbody>${rows}</tbody></table>`
  }

  const stockCards = activeTickers.map(t => {
    const p = t.data
    const pct = pos52w(p?.price, p?.low52, p?.high52)
    return `<div class="stock-card">
      <div class="sc-header">
        <span class="sc-sym">${t.symbol}</span>
        <span class="sc-cur">${t.currency}</span>
        <span class="sc-price">${fmt(p?.price)}</span>
        <span class="sc-chg ${p?.change >= 0 ? 'pos' : 'neg'}">${p?.change >= 0 ? '\u25b2' : '\u25bc'} ${fmt(Math.abs(p?.change))}%</span>
      </div>
      <div class="sc-bar-wrap"><div class="sc-bar-fill" style="width:${pct}%"></div><div class="sc-bar-dot" style="left:${pct}%"></div></div>
      <div class="sc-range">${fmt(p?.low52)} <span class="sc-range-label">52W Range</span> ${fmt(p?.high52)}</div>
      <div class="sc-iv">Implied Volatility: <strong>${fmt(p?.iv)}%</strong></div>
      ${t.bullCase ? `<div class="sc-section sc-bull"><strong>Bull Case</strong><p>${t.bullCase}</p></div>` : ''}
      ${t.bearCase ? `<div class="sc-section sc-bear"><strong>Bear Case</strong><p>${t.bearCase}</p></div>` : ''}
      ${t.entryNote ? `<div class="sc-section sc-entry"><strong>Entry Note</strong><p>${t.entryNote}</p></div>` : ''}
    </div>`
  }).join('')

  const prodRows = (state.productRows || []).map((r, i) =>
    `<tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}"><td class="param-key">${r.key}</td><td class="param-val">${r.val}</td></tr>`
  ).join('')

  const gridsHTML = [
    state.showGrids.rc ? `<div class="grid-block">${gridHTML('Strike', RC_STRIKES, TENORS, state.pricingGrids.rc)}</div>` : '',
    state.showGrids.snowball ? `<div class="grid-block">${gridHTML('Barrier/Coupon', SNOWBALL_BARRIERS, TENORS, state.pricingGrids.snowball)}</div>` : '',
    state.showGrids.bonus ? `<div class="grid-block">${gridHTML('Barrier', BONUS_BARRIERS, TENORS, state.pricingGrids.bonus, BONUS_CAPS)}</div>` : '',
    state.showGrids.cpn ? `<div class="grid-block">${gridHTML('Protection', CPN_PROTECTIONS, TENORS, state.pricingGrids.cpn)}</div>` : '',
  ].filter(Boolean).join('')

  const gridTitles = { rc: 'Autocall Reverse Convertible', snowball: 'Snowball', bonus: 'Bonus Note', cpn: 'Capital Protected Note' }
  const pricingSections = [
    state.showGrids.rc ? { key: 'rc', title: gridTitles.rc } : null,
    state.showGrids.snowball ? { key: 'snowball', title: gridTitles.snowball } : null,
    state.showGrids.bonus ? { key: 'bonus', title: gridTitles.bonus } : null,
    state.showGrids.cpn ? { key: 'cpn', title: gridTitles.cpn } : null,
  ].filter(Boolean)

  const pricingHTML = pricingSections.map(({ key, title }) => {
    const grids = { rc: gridHTML('Strike', RC_STRIKES, TENORS, state.pricingGrids.rc), snowball: gridHTML('Barrier/Coupon', SNOWBALL_BARRIERS, TENORS, state.pricingGrids.snowball), bonus: gridHTML('Barrier', BONUS_BARRIERS, TENORS, state.pricingGrids.bonus, BONUS_CAPS), cpn: gridHTML('Protection', CPN_PROTECTIONS, TENORS, state.pricingGrids.cpn) }
    return `<div class="section pricing-section">
      <h3>${title} <span class="currency-tag">${state.pricingCurrency}</span></h3>
      ${grids[key]}
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${state.bankName || 'Plurimi Wealth'} \u2014 Structured Product Pitch</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 20mm }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
body { font-family: 'Montserrat', sans-serif; color: #333; background: #fff; font-size: 11px; line-height: 1.8; -webkit-print-color-adjust: exact; print-color-adjust: exact }

/* ── Cover page ── */
.cover { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #fff; page-break-after: always }
.cover-top { background: #202a3e; padding: 64px 72px 56px; color: #fff; position: relative }
.cover-top::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: #b38559 }
.cover-bank-name { font-family: 'Cormorant Garamond', serif; font-size: 56px; font-weight: 600; color: #fff; letter-spacing: .02em; line-height: 1.1; margin-bottom: 24px }
.cover-gold-line { width: 72px; height: 2px; background: #b38559; margin-bottom: 20px }
.cover-subtitle { font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 600; color: #b38559; letter-spacing: .2em; text-transform: uppercase }
.cover-body { flex: 1; padding: 56px 72px; display: flex; flex-direction: column; justify-content: flex-end }
.cover-meta { border-top: 1px solid #e2e8f0; padding-top: 28px; display: flex; justify-content: space-between; align-items: flex-end }
.cover-meta-label { font-size: 9px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #999; margin-bottom: 6px }
.cover-client-name { font-family: 'Cormorant Garamond', serif; font-size: 24px; font-weight: 600; color: #202a3e }
.cover-client-email { font-size: 11px; color: #777; margin-top: 4px }
.cover-date-block { text-align: right }
.cover-date { font-size: 12px; color: #555 }
.cover-prepared-by { font-size: 10px; color: #aaa; margin-top: 4px; font-style: italic }

/* ── Main content ── */
.page { max-width: 794px; margin: 0 auto; padding: 60px 72px }
h2 { font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 600; color: #202a3e; margin: 40px 0 14px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0 }
h3 { font-family: 'Cormorant Garamond', serif; font-size: 16px; font-weight: 600; color: #202a3e; margin: 28px 0 10px }
.section { page-break-inside: avoid; margin-bottom: 12px }

/* ── Thesis ── */
.thesis { font-size: 11px; color: #333; line-height: 1.8; padding: 20px 24px; border-left: 3px solid #202a3e; background: #f9f9f9 }

/* ── Basket dynamics ── */
.basket-text { font-size: 11px; color: #444; line-height: 1.8 }

/* ── Stock cards ── */
.stock-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin: 12px 0 }
.stock-card { border: 1px solid #e2e8f0; border-top: 3px solid #202a3e; padding: 14px; page-break-inside: avoid }
.sc-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; flex-wrap: wrap }
.sc-sym { font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 700; color: #202a3e }
.sc-cur { font-size: 9px; color: #999; background: #f3f4f5; padding: 2px 6px; border-radius: 2px }
.sc-price { font-size: 13px; font-weight: 600; font-family: 'Courier New', monospace; margin-left: auto; color: #202a3e }
.sc-chg { font-size: 10px; font-family: 'Courier New', monospace; font-weight: 600 }
.sc-chg.pos { color: #059669 } .sc-chg.neg { color: #dc2626 }
.sc-bar-wrap { position: relative; height: 3px; background: #e2e8f0; border-radius: 2px; margin: 8px 0 }
.sc-bar-fill { position: absolute; top: 0; left: 0; height: 100%; background: linear-gradient(90deg, #dc2626, #f59e0b, #059669); border-radius: 2px }
.sc-bar-dot { position: absolute; top: -4px; width: 10px; height: 10px; background: #202a3e; border: 2px solid #fff; border-radius: 50%; transform: translateX(-50%); box-shadow: 0 1px 3px rgba(0,0,0,.2) }
.sc-range { font-size: 9px; color: #aaa; font-family: 'Courier New', monospace; display: flex; justify-content: space-between; margin-top: 2px }
.sc-range-label { color: #ccc }
.sc-iv { font-size: 10px; color: #666; margin-top: 6px }
.sc-section { margin-top: 10px; padding: 8px 10px; font-size: 10px; line-height: 1.7 }
.sc-section strong { display: block; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 3px }
.sc-section p { margin: 0; color: #444 }
.sc-bull { background: #f0fdf4; border-left: 2px solid #059669 } .sc-bull strong { color: #059669 }
.sc-bear { background: #fef2f2; border-left: 2px solid #dc2626 } .sc-bear strong { color: #dc2626 }
.sc-entry { background: #f5f7ff; border-left: 2px solid #202a3e } .sc-entry strong { color: #202a3e }

/* ── Product parameters ── */
.prod-table { width: 100%; border-collapse: collapse; margin: 8px 0 }
.prod-table tr.row-even { background: #f9f9f9 } .prod-table tr.row-odd { background: #fff }
.param-key { padding: 10px 16px; font-size: 11px; color: #666; font-weight: 500; width: 45%; border-bottom: 1px solid #f0f0f0 }
.param-val { padding: 10px 16px; font-size: 11px; color: #202a3e; font-family: 'Courier New', monospace; font-weight: 600; border-bottom: 1px solid #f0f0f0 }

/* ── Pricing tables ── */
.pricing-section { page-break-inside: avoid }
.currency-tag { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 600; color: #b38559; letter-spacing: .06em }
.pg-table { width: 100%; border-collapse: collapse; margin: 8px 0 }
.pg-table thead tr { background: #202a3e; border-bottom: 3px solid #b38559 }
.pg-table th { color: #fff; padding: 10px 16px; text-align: center; font-size: 10px; font-weight: 600; letter-spacing: .06em; font-family: 'Montserrat', sans-serif; border: 1px solid #2e3c56 }
.pg-table th.row-label-head { text-align: left }
.pg-table tr.row-even { background: #f9f9f9 } .pg-table tr.row-odd { background: #fff }
.pg-table td { padding: 10px 16px; text-align: center; font-family: 'Courier New', monospace; font-size: 11px; color: #202a3e; border: 1px solid #e8e8e8 }
.row-label { text-align: left !important; color: #666; font-weight: 500; font-family: 'Montserrat', sans-serif; font-size: 10px }
.cap-note { font-size: 8px; color: #aaa; display: block; margin-top: 1px }

/* ── Disclaimer ── */
.disclaimer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #aaa; line-height: 1.7; font-style: italic }

@media print {
  body { font-size: 10px }
  .cover { min-height: 297mm; page-break-after: always }
  .page { padding: 0; max-width: 100% }
  .stock-cards { grid-template-columns: repeat(3, 1fr) }
  .section { page-break-inside: avoid }
}
</style>
</head>
<body>

<div class="cover">
  <div class="cover-top">
    <div class="cover-bank-name">${state.bankName || 'Plurimi Wealth'}</div>
    <div class="cover-gold-line"></div>
    <div class="cover-subtitle">Structured Product Pitch</div>
  </div>
  <div class="cover-body">
    <div class="cover-meta">
      <div>
        <div class="cover-meta-label">Prepared for</div>
        <div class="cover-client-name">${state.clientName || 'Institutional Client'}</div>
        ${state.clientEmail ? `<div class="cover-client-email">${state.clientEmail}</div>` : ''}
      </div>
      <div class="cover-date-block">
        <div class="cover-date">${dateStr}</div>
        <div class="cover-prepared-by">Trade Architect Pro</div>
      </div>
    </div>
  </div>
</div>

<div class="page">
  <div class="section">
    <h2>Investment Thesis</h2>
    <div class="thesis">${(state.thesis || '').replace(/\n/g, '<br/>')}</div>
  </div>

  <div class="section">
    <h2>Underlying Assets</h2>
    <div class="stock-cards">${stockCards}</div>
  </div>

  <div class="section">
    <h2>Basket Dynamics</h2>
    <div class="basket-text">${(state.basketDynamics || '').replace(/\n/g, '<br/>')}</div>
  </div>

  <div class="section">
    <h2>Product Parameters</h2>
    <table class="prod-table"><tbody>${prodRows}</tbody></table>
  </div>

  ${pricingHTML ? `<div class="section"><h2>Indicative Pricing</h2></div>${pricingHTML}` : ''}

  <div class="disclaimer">${state.disclaimer}</div>
</div>

</body>
</html>`
}
</style></head><body>
<div class="page">
  <div class="cover-header">
    <div>
      <div class="bank-name">${state.bankName || 'Investment Bank'}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">Structured Products | Trade Architect Pro</div>
    </div>
    <div class="client-info">
      <div class="client-name">${state.clientName || 'Institutional Client'}</div>
      <div>${state.clientEmail || ''}</div>
      <div>${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
  </div>
  <h2>Investment Thesis</h2>
  <div class="thesis">${(state.thesis || '').replace(/\n/g, '<br/>')}</div>
  <h2>Underlying Assets</h2>
  <div class="stock-cards">${stockCards}</div>
  <h2>Basket Dynamics</h2>
  <div style="color:#334155;font-size:13px;line-height:1.8">${(state.basketDynamics || '').replace(/\n/g, '<br/>')}</div>
  <h2>Product Parameters</h2>
  <table class="prod-table"><tbody>${prodRows}</tbody></table>
  ${gridsHTML ? `<h2>Indicative Pricing</h2>${gridsHTML}` : ''}
  <div class="disclaimer">${state.disclaimer}</div>
</div>
</body></html>`
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const FONT = "'Montserrat', sans-serif"
const MONO = "'Courier New', monospace"

const css = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#f3f4f5;color:#202a3e;font-family:${FONT}}
.tap-root{min-height:100vh;background:#f3f4f5;color:#202a3e;font-family:${FONT}}
.tap-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 32px;height:58px;background:#202a3e;border-bottom:1px solid #b38559;position:sticky;top:0;z-index:100}
.tap-logo{display:flex;align-items:center;gap:10px}
.tap-logo-icon{width:30px;height:30px;background:#b38559;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff}
.tap-logo-text{font-size:14px;font-weight:600;letter-spacing:.03em;color:#ffffff}
.tap-logo-sub{font-size:10px;color:#b38559;letter-spacing:.08em;text-transform:uppercase}
.tap-steps{display:flex;gap:4px}
.tap-step{padding:6px 18px;border-radius:4px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;color:#b38559;border:1px solid transparent;letter-spacing:.03em}
.tap-step.active{background:#ffffff;color:#202a3e;border-color:#b38559}
.tap-step:hover:not(.active){color:#b38559;background:#f3f4f5}
.tap-step-num{font-family:${MONO};font-size:10px;opacity:.7;margin-right:6px}
.tap-main{max-width:1200px;margin:0 auto;padding:32px 24px}
.tap-section-title{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#202a3e;margin-bottom:20px;display:flex;align-items:center;gap:8px}
.tap-section-title::after{content:'';flex:1;height:1px;background:#e2e8f0}
.tap-card{background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px}
.tap-card+.tap-card{margin-top:16px}
.tap-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.tap-field{display:flex;flex-direction:column;gap:6px}
.tap-label{font-size:11px;font-weight:500;color:#202a3e;letter-spacing:.05em;text-transform:uppercase}
.tap-input{background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;color:#202a3e;font-family:${FONT};font-size:13px;padding:9px 12px;outline:none;transition:border-color .15s}
.tap-input:focus{border-color:#b38559}
.tap-input::placeholder{color:#6b7280}
.tap-select{background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;color:#202a3e;font-family:${FONT};font-size:13px;padding:9px 12px;outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px}
.tap-textarea{background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;color:#202a3e;font-family:${FONT};font-size:13px;padding:10px 12px;outline:none;resize:vertical;line-height:1.6;transition:border-color .15s;min-height:80px}
.tap-textarea:focus{border-color:#b38559}
.tap-textarea::placeholder{color:#6b7280}
.tap-ticker-row{display:flex;gap:10px;align-items:flex-end;margin-bottom:12px}
.tap-ticker-sym{flex:2}
.tap-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;border:none;font-family:${FONT};letter-spacing:.02em;white-space:nowrap}
.tap-btn-primary{background:#b38559;color:#fff}
.tap-btn-primary:hover{background:#a0764a}
.tap-btn-secondary{background:#ffffff;color:#202a3e;border:1px solid #e2e8f0}
.tap-btn-secondary:hover{background:#f3f4f5;color:#202a3e}
.tap-btn-ai{background:#b38559;color:#ffffff;border:1px solid #b38559;font-size:11px;padding:5px 12px}
.tap-btn-ai:hover{background:#a0764a}
.tap-btn-sm{padding:6px 12px;font-size:11px}
.tap-btn:disabled{opacity:.5;cursor:not-allowed}
.tap-fetch-btn{padding:9px 14px;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;color:#202a3e;cursor:pointer;font-size:12px;font-family:${FONT};white-space:nowrap;transition:all .15s}
.tap-fetch-btn:hover{color:#b38559;border-color:#b38559}
.tap-mdata{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
.tap-mdata-chip{background:#f3f4f5;border:1px solid #e2e8f0;border-radius:4px;padding:4px 10px;font-size:11px;color:#6b7280;font-family:${MONO}}
.tap-mdata-chip span{color:#202a3e;font-weight:500}
.tap-mdata-chip.pos{color:#34d399}
.tap-mdata-chip.neg{color:#f87171}
.chip-val{color:#202a3e!important}
.tap-stock-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.tap-stock-card{background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:14px}
.tap-stock-symbol{font-size:16px;font-weight:700;color:#202a3e;font-family:${MONO}}
.tap-stock-price{font-size:20px;font-weight:600;color:#202a3e;font-family:${MONO}}
.tap-stock-change{font-size:12px;font-weight:500;font-family:${MONO}}
.tap-stock-change.pos{color:#34d399}
.tap-stock-change.neg{color:#f87171}
.tap-52w{display:flex;flex-direction:column;gap:4px}
.tap-52w-bar-wrap{position:relative;height:4px;background:#e2e8f0;border-radius:2px}
.tap-52w-bar-fill{position:absolute;top:0;left:0;height:100%;background:linear-gradient(90deg,#f87171,#facc15,#34d399);border-radius:2px}
.tap-52w-marker{position:absolute;top:-4px;width:12px;height:12px;background:#ffffff;border:2px solid #b38559;border-radius:50%;transform:translateX(-50%)}
.tap-52w-labels{display:flex;justify-content:space-between;font-size:10px;color:#6b7280;font-family:${MONO};margin-top:2px}
.tap-wb-block{background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
.tap-wb-block-header{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid #e2e8f0;background:#f3f4f5}
.tap-wb-block-title{font-size:12px;font-weight:600;color:#202a3e;letter-spacing:.05em;display:flex;align-items:center;gap:8px}
.tap-wb-block-body{padding:20px}
.tap-prod-table{width:100%;border-collapse:collapse}
.tap-prod-table td{padding:9px 14px;font-size:13px;border-bottom:1px solid #e2e8f0}
.tap-prod-table td:first-child{color:#6b7280;width:45%;font-weight:500}
.tap-prod-table td:last-child{color:#202a3e;font-family:${MONO}}
.tap-prod-table tr:last-child td{border-bottom:none}
.tap-grid-wrap{overflow-x:auto}
.tap-pg{width:100%;border-collapse:collapse;font-family:${MONO};font-size:12px}
.tap-pg th{background:#f3f4f5;color:#202a3e;font-weight:500;padding:8px 12px;text-align:center;border:1px solid #e2e8f0}
.tap-pg th:first-child{text-align:left}
.tap-pg td{border:1px solid #e2e8f0;padding:0}
.tap-pg td input{width:100%;background:transparent;border:none;color:#202a3e;text-align:center;padding:7px 8px;font-family:${MONO};font-size:12px;outline:none;transition:background .1s}
.tap-pg td input:focus{background:#f3f4f5}
.tap-pg td:first-child input{text-align:left;padding-left:12px;color:#6b7280}
.tap-pg-label{background:#f3f4f5;color:#6b7280;padding:7px 12px;font-size:11px}
.tap-dropzone{border:2px dashed #e2e8f0;border-radius:10px;padding:48px 24px;text-align:center;cursor:pointer;transition:all .2s;color:#202a3e}
.tap-dropzone:hover,.tap-dropzone.drag{border-color:#b38559;color:#b38559;background:#f9f9f9}
.tap-dropzone-icon{font-size:32px;margin-bottom:8px}
.tap-dropzone-text{font-size:13px}
.tap-dropzone-sub{font-size:11px;margin-top:4px;opacity:.7}
.tap-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px}
.tap-modal{background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;max-width:860px;width:100%;max-height:85vh;display:flex;flex-direction:column}
.tap-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #e2e8f0}
.tap-modal-title{font-size:14px;font-weight:600;color:#202a3e}
.tap-modal-body{padding:24px;overflow-y:auto;flex:1}
.tap-modal-footer{padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end}
.tap-export-preview{background:#f3f4f5;border:1px solid #e2e8f0;border-radius:6px;padding:20px;font-family:${MONO};font-size:12px;color:#202a3e;white-space:pre-wrap;max-height:400px;overflow-y:auto;line-height:1.7}
.tap-nav{display:flex;justify-content:space-between;align-items:center;margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{animation:spin .8s linear infinite;display:inline-block}
.tap-toggle{display:inline-flex;border-radius:3px;overflow:hidden;border:1px solid #b38559;font-size:10px;font-weight:600;letter-spacing:.04em}
.tap-toggle-opt{padding:3px 8px;border:none;cursor:pointer;font-family:inherit;transition:background .1s;line-height:1.4}
.tap-toggle-opt.active{background:#b38559;color:#fff}
.tap-toggle-opt:not(.active){background:#ffffff;color:#b38559}
.tap-checkbox-row{display:flex;align-items:center;gap:8px;font-size:13px;color:#202a3e;cursor:pointer}
.tap-checkbox-row input{accent-color:#b38559;width:14px;height:14px;cursor:pointer}
.tap-tag{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:3px;font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
.tap-tag-blue{background:#b38559;color:#ffffff}
.tap-tag-green{background:#0a2010;color:#34d399}
.tap-tag-purple{background:#b38559;color:#ffffff}
.tap-divider{height:1px;background:#e2e8f0;margin:20px 0}
.tap-grid-section{margin-bottom:28px}
.tap-grid-section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.tap-grid-section-title{font-size:13px;font-weight:600;color:#202a3e;display:flex;align-items:center;gap:8px}
.tap-export-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}
.tap-export-card{flex:1;min-width:200px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:20px;cursor:pointer;transition:all .2s;text-align:center}
.tap-export-card:hover{border-color:#b38559;background:#f9f9f9}
.tap-export-card-icon{font-size:28px;margin-bottom:8px}
.tap-export-card-title{font-size:13px;font-weight:600;color:#202a3e;margin-bottom:4px}
.tap-export-card-desc{font-size:11px;color:#6b7280}
.tap-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
.tap-dot-green{background:#34d399;box-shadow:0 0 6px #34d399}
.tap-dot-gray{background:#6b7280}
.tap-toast{position:fixed;bottom:24px;right:24px;z-index:300;background:#ffffff;border:1px solid #b38559;border-radius:8px;padding:12px 20px;font-size:13px;color:#b38559;display:flex;align-items:center;gap:8px;animation:slideUp .3s ease}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
.tap-live-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#f0fdf4;color:#059669;border:1px solid #86efac;letter-spacing:.05em;text-transform:uppercase}
.tap-live-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:#059669;display:inline-block}
.tap-live-quote{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;margin-bottom:12px}
.tap-live-quote-val{font-family:${MONO};font-size:14px;font-weight:700;color:#059669}
`

function Spinner() { return <span className="spin">⟳</span> }

function ShortLongToggle({ value, onChange }) {
  return (
    <div className="tap-toggle">
      {['Short', 'Long'].map(opt => (
        <button key={opt} className={`tap-toggle-opt ${value === opt.toLowerCase() ? 'active' : ''}`}
          onClick={() => onChange(opt.toLowerCase())}>
          {opt}
        </button>
      ))}
    </div>
  )
}

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t) }, [onClose])
  return <div className="tap-toast">✓ {msg}</div>
}

function PricingGrid({ label, rowLabels, colLabels, grid, onChange, note }) {
  return (
    <div className="tap-grid-wrap">
      {note && <div style={{ fontSize: 11, color: '#202a3e', marginBottom: 8 }}>{note}</div>}
      <table className="tap-pg">
        <thead><tr><th>{label}</th>{colLabels.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rowLabels.map((row, ri) => (
            <tr key={row}>
              <td><div className="tap-pg-label">{row}</div></td>
              {colLabels.map((_, ci) => (
                <td key={ci}><input value={grid?.[ri]?.[ci] ?? ''} onChange={e => onChange(ri, ci, e.target.value)} placeholder="—" /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function TradeArchitectPro() {
  const [state, setState] = useState(DEFAULT_STATE)
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef()
  const [sgLoading, setSgLoading] = useState({})
  const [sgLivePrices, setSgLivePrices] = useState({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tap_state_v3')
      if (saved) setState(prev => ({ ...prev, ...JSON.parse(saved) }))
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('tap_state_v3', JSON.stringify(state)) } catch {}
    }
  }, [state])

  const set = useCallback((updater) => setState(prev => {
    const next = typeof updater === 'function' ? updater(prev) : updater
    return { ...prev, ...next }
  }), [])

  const showToast = (msg) => setToast(msg)

  const fallbackCopy = (text, type) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    try { document.execCommand('copy'); showToast(type === 'email' ? 'Email text copied' : 'HTML copied to clipboard') }
    catch { showToast('Copy failed — select all text manually') }
    document.body.removeChild(ta)
  }

  const copyToClipboard = (text, type) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(type === 'email' ? 'Email text copied' : 'HTML copied to clipboard'))
        .catch(() => fallbackCopy(text, type))
    } else { fallbackCopy(text, type) }
  }

  const fetchTicker = useCallback(async (idx) => {
    const sym = state.tickers[idx]?.symbol
    if (!sym) return
    setState(prev => { const t = [...prev.tickers]; t[idx] = { ...t[idx], loading: true, data: null }; return { ...prev, tickers: t } })
    try {
      const data = await fetchMarketData(sym)
      setState(prev => { const t = [...prev.tickers]; t[idx] = { ...t[idx], loading: false, data }; return { ...prev, tickers: t } })
    } catch {
      setState(prev => { const t = [...prev.tickers]; t[idx] = { ...t[idx], loading: false }; return { ...prev, tickers: t } })
    }
  }, [state.tickers])

  const fetchAll = useCallback(async () => {
    for (let i = 0; i < 3; i++) { if (state.tickers[i]?.symbol) fetchTicker(i) }
  }, [state.tickers, fetchTicker])

  const aiRefresh = useCallback(async (field) => {
    setState(prev => ({ ...prev, aiLoading: { ...prev.aiLoading, [field]: true } }))
    const syms = state.tickers.filter(t => t.symbol).map(t => t.symbol).join(', ')
    const tickerField = field.match(/^(bull|bear|entry)_(\d)$/)
    try {
      const short = state.aiMode?.[field] === 'short'
      let prompt
      if (tickerField) {
        const [, type, idx] = tickerField
        const sym = state.tickers[parseInt(idx)]?.symbol
        if (short) {
          const shortMap = { bull: 'bull case in 1–2 punchy sentences', bear: 'bear case in 1–2 punchy sentences', entry: 'entry rationale in 1–2 direct sentences' }
          prompt = `Write a ${shortMap[type]} for ${sym} for an institutional pitch. No disclaimers.`
        } else {
          const typeMap = { bull: 'bull case (3–4 sentences, positive scenario)', bear: 'bear case (3–4 sentences, downside risks)', entry: 'entry note (2–3 sentences, technical entry rationale)' }
          prompt = `Write a professional ${typeMap[type]} for ${sym} for an institutional pitch deck. Be specific and use financial terminology. No disclaimers.`
        }
      } else if (field === 'thesis') {
        prompt = short
          ? `Write a 1–2 sentence investment thesis for a basket of ${syms}. Punchy, institutional tone. No disclaimers.`
          : `You are a senior structured products analyst at ${state.bankName || 'a private bank'}. Write a professional, institutional-grade investment thesis (4–6 sentences) for a basket of stocks: ${syms}. Focus on macro drivers, sector positioning, and rationale for a structured product overlay. No disclaimers. Pure thesis prose.`
      } else {
        prompt = short
          ? `In 1–2 sentences, summarise the basket dynamics for: ${syms}. Direct, institutional tone.`
          : `Analyse the basket dynamics for: ${syms}. In 3–5 professional sentences explain: correlation characteristics, macro drivers, diversification merits, and why these stocks work well together in a worst-of structured product. Institutional tone.`
      }
      const result = await callClaude(prompt)
      if (tickerField) {
        const [, type, idx] = tickerField
        const keyMap = { bull: 'bullCase', bear: 'bearCase', entry: 'entryNote' }
        setState(prev => {
          const tickers = [...prev.tickers]
          tickers[parseInt(idx)] = { ...tickers[parseInt(idx)], [keyMap[type]]: result.trim() }
          return { ...prev, tickers, aiLoading: { ...prev.aiLoading, [field]: false } }
        })
      } else {
        setState(prev => ({ ...prev, [field]: result.trim(), aiLoading: { ...prev.aiLoading, [field]: false } }))
      }
    } catch (err) {
      console.error('AI error full details:', err)
      setState(prev => ({ ...prev, aiLoading: { ...prev.aiLoading, [field]: false } }))
      showToast('AI error: ' + (err?.message || 'Unknown error'))
    }
  }, [state])

  const updateGrid = useCallback((gridName, ri, ci, val) => {
    setState(prev => {
      const grids = { ...prev.pricingGrids }
      grids[gridName] = grids[gridName].map((row, r) => r === ri ? row.map((cell, c) => c === ci ? val : cell) : row)
      return { ...prev, pricingGrids: grids }
    })
  }, [])

  const handleFileDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = ev.target.result.trim().split(/\r?\n/).map(r => r.split(/[,\t]/))
      const grid = Array(4).fill(null).map((_, ri) => Array(4).fill(null).map((_, ci) => rows[ri + 1]?.[ci + 1] || ''))
      setState(prev => ({ ...prev, pricingGrids: { ...prev.pricingGrids, rc: grid } }))
      showToast('CSV imported into RC grid')
    }
    reader.readAsText(file)
  }, [])

  const fetchSGPrice = useCallback(async (productKey) => {
    const activeSymbols = state.tickers.filter(t => t.symbol).map(t => t.symbol)
    if (activeSymbols.length === 0) { showToast('Add tickers first'); return }
    setSgLoading(prev => ({ ...prev, [productKey]: true }))
    const maturityRow = state.productRows.find(r => r.key.toLowerCase().includes('maturity'))
    const maturityMonths = parseInt(maturityRow?.val) || 24
    const barrierRow = state.productRows.find(r => r.key.toLowerCase().includes('barrier'))
    const barrierPct = parseFloat((barrierRow?.val || '70%').replace('%', '').trim())
    const barrier = isNaN(barrierPct) ? 0.70 : barrierPct / 100
    try {
      const res = await fetch('/api/sg-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productType: productKey, underlyings: activeSymbols, maturityMonths, barrier, currency: state.pricingCurrency }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const pct = typeof data.value === 'number' ? (data.value * 100).toFixed(2) + '% p.a.' : String(data.value)
      setSgLivePrices(prev => ({ ...prev, [productKey]: pct }))
      showToast('Live price received: ' + pct)
    } catch (err) {
      console.error('SG price error:', err)
      showToast('SG pricing error: ' + (err?.message || 'Unknown error'))
    } finally {
      setSgLoading(prev => ({ ...prev, [productKey]: false }))
    }
  }, [state])

  const buildEmailExport = () => {
    const activeTickers = state.tickers.filter(t => t.symbol)
    let txt = `INVESTMENT PITCH — ${state.bankName || ''}\nClient: ${state.clientName || ''} | ${state.clientEmail || ''}\nDate: ${new Date().toLocaleDateString('en-GB')}\n\n`
    txt += `${'='.repeat(60)}\nINVESTMENT THESIS\n${'='.repeat(60)}\n${state.thesis || ''}\n\n`
    txt += `${'='.repeat(60)}\nUNDERLYING ASSETS\n${'='.repeat(60)}\n`
    activeTickers.forEach(t => {
      txt += `\n${t.symbol} — ${t.data ? fmt(t.data.price) : 'N/A'}\n`
      if (t.bullCase) txt += `  Bull: ${t.bullCase}\n`
      if (t.bearCase) txt += `  Bear: ${t.bearCase}\n`
      if (t.entryNote) txt += `  Entry: ${t.entryNote}\n`
    })
    txt += `\n${'='.repeat(60)}\nPRODUCT PARAMETERS\n${'='.repeat(60)}\n`
    ;(state.productRows || []).forEach(r => { txt += `  ${(r.key || '').padEnd(24)}: ${r.val || ''}\n` })
    txt += '\n'
    if (state.showGrids.rc) txt += asciiTable('AUTOCALL RC', RC_STRIKES, TENORS, state.pricingGrids.rc) + '\n'
    if (state.showGrids.snowball) txt += asciiTable('SNOWBALL', SNOWBALL_BARRIERS, state.pricingGrids.snowball) + '\n'
    if (state.showGrids.bonus) txt += asciiTable('BONUS NOTE', BONUS_BARRIERS, TENORS, state.pricingGrids.bonus) + '\n'
    if (state.showGrids.cpn) txt += asciiTable('CPN', CPN_PROTECTIONS, TENORS, state.pricingGrids.cpn) + '\n'
    txt += `\n${'─'.repeat(60)}\n${state.disclaimer}`
    return txt
  }

  const activeTickers = state.tickers.filter(t => t.symbol && t.data)

  return (
    <div className="tap-root">
      <style>{css}</style>

      <div className="tap-topbar">
        <div className="tap-logo">
          <div className="tap-logo-icon">TA</div>
          <div>
            <div className="tap-logo-text">Trade Architect Pro</div>
            <div className="tap-logo-sub">{state.bankName || 'Structured Products'}</div>
          </div>
        </div>
        <div className="tap-steps">
          {['Market Data', 'Workbench', 'Pricing', 'Export'].map((s, i) => (
            <div key={i} className={`tap-step ${state.step === i + 1 ? 'active' : ''}`} onClick={() => set({ step: i + 1 })}>
              <span className="tap-step-num">0{i + 1}</span>{s}
            </div>
          ))}
        </div>
      </div>

      <div className="tap-main">
        {state.step === 1 && (
          <div>
            <div className="tap-section-title">Client & Bank Configuration</div>
            <div className="tap-card">
              <div className="tap-form-grid">
                {[['bankName', 'Bank / Firm Name'], ['clientName', 'Client Name'], ['clientEmail', 'Client Email']].map(([k, label]) => (
                  <div className="tap-field" key={k}>
                    <label className="tap-label">{label}</label>
                    <input className="tap-input" value={state[k]} onChange={e => set({ [k]: e.target.value })} placeholder={label} />
                  </div>
                ))}
                <div className="tap-field" style={{ gridColumn: '1/-1' }}>
                  <label className="tap-label">Disclaimer</label>
                  <textarea className="tap-textarea" value={state.disclaimer} onChange={e => set({ disclaimer: e.target.value })} rows={2} />
                </div>
              </div>
            </div>

            <div className="tap-section-title" style={{ marginTop: 28 }}>Underlying Basket</div>
            <div className="tap-card">
              {state.tickers.map((t, i) => (
                <div key={i}>
                  {i > 0 && <div className="tap-divider" />}
                  <div className="tap-ticker-row">
                    <div className="tap-field tap-ticker-sym">
                      <label className="tap-label">Ticker {i + 1}</label>
                      <input className="tap-input" value={t.symbol}
                        onChange={e => setState(prev => { const tickers = [...prev.tickers]; tickers[i] = { ...tickers[i], symbol: e.target.value.toUpperCase() }; return { ...prev, tickers } })}
                        placeholder="e.g. AAPL" style={{ fontFamily: MONO, fontWeight: 600 }} />
                    </div>
                    <button className="tap-fetch-btn" onClick={() => fetchTicker(i)} disabled={!t.symbol}>
                      {t.loading ? <Spinner /> : 'Fetch ↓'}
                    </button>
                  </div>
                  {t.data && (
                    <div className="tap-mdata">
                      <div className="tap-mdata-chip"><span className="chip-val">{fmt(t.data.price)}</span> Price</div>
                      <div className={`tap-mdata-chip ${t.data.change >= 0 ? 'pos' : 'neg'}`}>{t.data.change >= 0 ? '▲' : '▼'} {fmt(Math.abs(t.data.change))}%</div>
                      <div className="tap-mdata-chip">52W <span className="chip-val">{fmt(t.data.low52)} – {fmt(t.data.high52)}</span></div>
                      <div className="tap-mdata-chip">IV <span className="chip-val">{fmt(t.data.iv)}%</span></div>
                    </div>
                  )}
                  {t.loading && <div style={{ fontSize: 12, color: '#4a5578', marginTop: 8 }}>Fetching market data…</div>}
                </div>
              ))}
              <div className="tap-divider" />
              <button className="tap-btn tap-btn-primary" onClick={fetchAll}>↓ Fetch All Tickers</button>
            </div>
            <div className="tap-nav">
              <div />
              <button className="tap-btn tap-btn-primary" onClick={() => set({ step: 2 })}>Continue to Workbench →</button>
            </div>
          </div>
        )}

        {state.step === 2 && (
          <div>
            <div className="tap-wb-block" style={{ marginBottom: 16 }}>
              <div className="tap-wb-block-header">
                <div className="tap-wb-block-title">📄 Investment Thesis</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShortLongToggle value={state.aiMode?.thesis || 'long'} onChange={v => set({ aiMode: { ...state.aiMode, thesis: v } })} />
                  <button className="tap-btn tap-btn-ai" onClick={() => aiRefresh('thesis')} disabled={state.aiLoading?.thesis}>
                    {state.aiLoading?.thesis ? <><Spinner /> Generating…</> : '✨ AI Refresh'}
                  </button>
                </div>
              </div>
              <div className="tap-wb-block-body">
                <textarea className="tap-textarea" style={{ minHeight: 120, width: '100%' }} value={state.thesis} onChange={e => set({ thesis: e.target.value })} placeholder="Enter or generate an investment thesis for this basket…" />
              </div>
            </div>

            <div className="tap-wb-block" style={{ marginBottom: 16 }}>
              <div className="tap-wb-block-header">
                <div className="tap-wb-block-title">📊 Stock Cards</div>
                <span className="tap-tag tap-tag-blue">{activeTickers.length} Active</span>
              </div>
              <div className="tap-wb-block-body">
                {activeTickers.length === 0 && <div style={{ color: '#4a5578', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No market data loaded. Go to Step 1 and fetch tickers.</div>}
                <div className="tap-stock-cards">
                  {state.tickers.map((t, i) => {
                    if (!t.symbol || !t.data) return null
                    const p = t.data
                    const pct = pos52w(p.price, p.low52, p.high52)
                    return (
                      <div key={i} className="tap-stock-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div><div className="tap-stock-symbol">{t.symbol}</div><div style={{ fontSize: 11, color: '#4a5578', marginTop: 2 }}>{t.currency}</div></div>
                          <div style={{ textAlign: 'right' }}>
                            <div className="tap-stock-price">{fmt(p.price)}</div>
                            <div className={`tap-stock-change ${p.change >= 0 ? 'pos' : 'neg'}`}>{p.change >= 0 ? '▲' : '▼'} {fmt(Math.abs(p.change))}%</div>
                          </div>
                        </div>
                        <div className="tap-52w">
                          <div className="tap-52w-bar-wrap">
                            <div className="tap-52w-bar-fill" style={{ width: `${pct}%` }} />
                            <div className="tap-52w-marker" style={{ left: `${pct}%` }} />
                          </div>
                          <div className="tap-52w-labels"><span>{fmt(p.low52)} L</span><span>52W Range</span><span>H {fmt(p.high52)}</span></div>
                        </div>
                        <div style={{ fontSize: 11, color: '#4a5578' }}>IV <span style={{ color: '#a0aec0', fontFamily: MONO }}>{fmt(p.iv)}%</span></div>
                        <div className="tap-divider" />
                        {[{ key: 'bullCase', label: '🟢 Bull Case', field: `bull_${i}` }, { key: 'bearCase', label: '🔴 Bear Case', field: `bear_${i}` }, { key: 'entryNote', label: '📍 Entry Note', field: `entry_${i}` }].map(({ key, label, field }) => (
                          <div key={key} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <label className="tap-label">{label}</label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ShortLongToggle value={state.aiMode?.[field] || 'long'} onChange={v => set({ aiMode: { ...state.aiMode, [field]: v } })} />
                                <button className="tap-btn tap-btn-ai" style={{ fontSize: 10 }} onClick={() => aiRefresh(field)} disabled={state.aiLoading?.[field]}>
                                  {state.aiLoading?.[field] ? <Spinner /> : '✨'}
                                </button>
                              </div>
                            </div>
                            <textarea className="tap-textarea" style={{ minHeight: 60, fontSize: 12 }} value={t[key]}
                              onChange={e => setState(prev => { const tickers = [...prev.tickers]; tickers[i] = { ...tickers[i], [key]: e.target.value }; return { ...prev, tickers } })}
                              placeholder={`${label.split(' ').slice(1).join(' ')}…`} />
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="tap-wb-block" style={{ marginBottom: 16 }}>
              <div className="tap-wb-block-header">
                <div className="tap-wb-block-title">🔗 Basket Dynamics</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShortLongToggle value={state.aiMode?.basketDynamics || 'long'} onChange={v => set({ aiMode: { ...state.aiMode, basketDynamics: v } })} />
                  <button className="tap-btn tap-btn-ai" onClick={() => aiRefresh('basketDynamics')} disabled={state.aiLoading?.basketDynamics}>
                    {state.aiLoading?.basketDynamics ? <><Spinner /> Generating…</> : '✨ AI Refresh'}
                  </button>
                </div>
              </div>
              <div className="tap-wb-block-body">
                <textarea className="tap-textarea" style={{ minHeight: 100, width: '100%' }} value={state.basketDynamics} onChange={e => set({ basketDynamics: e.target.value })} placeholder="Describe correlation characteristics, macro drivers, and diversification merits…" />
              </div>
            </div>

            <div className="tap-wb-block">
              <div className="tap-wb-block-header">
                <div className="tap-wb-block-title">⚙️ Product Parameters</div>
                <span className="tap-tag tap-tag-purple">Structured Product</span>
              </div>
              <div className="tap-wb-block-body">
                <div style={{ fontSize: 11, color: '#4a5578', marginBottom: 12 }}>Both parameter name and value are editable — customise freely.</div>
                <div style={{ border: '1px solid #1a2035', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr', background: '#0a0c10', borderBottom: '1px solid #1a2035', padding: '7px 0' }}>
                    <div />
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#4a5578', letterSpacing: '0.08em', textTransform: 'uppercase', paddingLeft: 12 }}>Parameter</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#4a5578', letterSpacing: '0.08em', textTransform: 'uppercase', paddingLeft: 12 }}>Value</div>
                  </div>
                  {state.productRows.map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr', borderBottom: i < state.productRows.length - 1 ? '1px solid #141824' : 'none', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 10, color: '#2a3555', fontFamily: MONO }}>{String(i + 1).padStart(2, '0')}</span></div>
                      <input className="tap-input" style={{ border: 'none', borderRight: '1px solid #141824', borderRadius: 0, fontSize: 12, color: '#a0aec0', background: 'transparent', padding: '9px 12px' }}
                        value={row.key} placeholder="Parameter name…"
                        onChange={e => setState(prev => { const productRows = [...prev.productRows]; productRows[i] = { ...productRows[i], key: e.target.value }; return { ...prev, productRows } })} />
                      <input className="tap-input" style={{ border: 'none', borderRadius: 0, fontSize: 12, fontFamily: MONO, fontWeight: 600, color: '#e8eaf0', background: 'transparent', padding: '9px 12px' }}
                        value={row.val} placeholder="Value…"
                        onChange={e => setState(prev => { const productRows = [...prev.productRows]; productRows[i] = { ...productRows[i], val: e.target.value }; return { ...prev, productRows } })} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="tap-btn tap-btn-secondary tap-btn-sm" onClick={() => setState(prev => ({ ...prev, productRows: [...prev.productRows, { key: '', val: '' }] }))}>+ Add Row</button>
                  {state.productRows.length > 1 && <button className="tap-btn tap-btn-secondary tap-btn-sm" style={{ color: '#f87171' }} onClick={() => setState(prev => ({ ...prev, productRows: prev.productRows.slice(0, -1) }))}>− Remove Last</button>}
                </div>
              </div>
            </div>

            <div className="tap-nav">
              <button className="tap-btn tap-btn-secondary" onClick={() => set({ step: 1 })}>← Back</button>
              <button className="tap-btn tap-btn-primary" onClick={() => set({ step: 3 })}>Continue to Pricing →</button>
            </div>
          </div>
        )}

        {state.step === 3 && (
          <div>
            <div className="tap-section-title">Pricing Currency</div>
            <div className="tap-card" style={{ marginBottom: 24, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 12, color: '#6b7a99' }}>All pricing grids expressed in:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {CURRENCIES.map(c => (
                    <button key={c} className="tap-btn" style={{ padding: '5px 16px', fontSize: 12, fontFamily: MONO, fontWeight: 600, background: state.pricingCurrency === c ? '#3b82f6' : '#141824', color: state.pricingCurrency === c ? '#fff' : '#6b7a99', border: `1px solid ${state.pricingCurrency === c ? '#3b82f6' : '#1e2535'}` }} onClick={() => set({ pricingCurrency: c })}>{c}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="tap-section-title">CSV / TSV Import</div>
            <div className={`tap-dropzone ${drag ? 'drag' : ''}`} style={{ marginBottom: 28 }}
              onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
              onDrop={handleFileDrop} onClick={() => fileRef.current?.click()}>
              <div className="tap-dropzone-icon">📂</div>
              <div className="tap-dropzone-text">Drop CSV / TSV pricing file here or click to browse</div>
              <div className="tap-dropzone-sub">Data will populate the RC grid (4×4 structure expected)</div>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={handleFileDrop} />
            </div>

            {[
              { key: 'rc', title: 'Autocall RC', label: 'Strike', rows: RC_STRIKES, note: 'Coupon values by Strike × Tenor' },
              { key: 'snowball', title: 'Snowball', label: 'Barrier/Coupon', rows: SNOWBALL_BARRIERS, note: 'Indicative coupons by Barrier/Coupon × Tenor' },
              { key: 'bonus', title: 'Bonus Note', label: 'Barrier', rows: BONUS_BARRIERS, note: null, caps: BONUS_CAPS },
              { key: 'cpn', title: 'Capital Protected Note (CPN)', label: 'Protection', rows: CPN_PROTECTIONS, note: 'Upside participation by protection × Tenor' },
            ].map(({ key, title, label, rows, note, caps }) => (
              <div key={key} className="tap-grid-section">
                <div className="tap-grid-section-header">
                  <div className="tap-grid-section-title">{title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="tap-btn tap-btn-secondary tap-btn-sm" onClick={() => fetchSGPrice(key)} disabled={sgLoading[key]}>
                      {sgLoading[key] ? <><Spinner /> Quoting…</> : '📡 Get Live Price'}
                    </button>
                    <label className="tap-checkbox-row">
                      <input type="checkbox" checked={state.showGrids[key]} onChange={e => set({ showGrids: { ...state.showGrids, [key]: e.target.checked } })} />
                      Include in Export
                    </label>
                  </div>
                </div>
                <div className="tap-card" style={{ padding: 16 }}>
                  {sgLivePrices[key] && (
                    <div className="tap-live-quote">
                      <span className="tap-live-badge">Live</span>
                      <span style={{ fontSize: 11, color: '#4a5578' }}>Latest quote:</span>
                      <span className="tap-live-quote-val">{sgLivePrices[key]}</span>
                    </div>
                  )}
                  {caps
                    ? <div><div style={{ fontSize: 11, color: '#4a5578', marginBottom: 10 }}>Fixed caps by tenor: {Object.entries(caps).map(([t, c]) => `${t}: ${c}`).join(' | ')}</div><PricingGrid label={label} rowLabels={rows} colLabels={TENORS} grid={state.pricingGrids[key]} onChange={(r, c, v) => updateGrid(key, r, c, v)} /></div>
                    : <PricingGrid label={label} rowLabels={rows} colLabels={TENORS} grid={state.pricingGrids[key]} onChange={(r, c, v) => updateGrid(key, r, c, v)} note={note} />
                  }
                </div>
              </div>
            ))}

            <div className="tap-nav">
              <button className="tap-btn tap-btn-secondary" onClick={() => set({ step: 2 })}>← Back</button>
              <button className="tap-btn tap-btn-primary" onClick={() => set({ step: 4 })}>Continue to Export →</button>
            </div>
          </div>
        )}

        {state.step === 4 && (
          <div>
            <div className="tap-section-title">Export Deliverables</div>
            <div className="tap-export-row">
              <div className="tap-export-card" onClick={() => setModal({ type: 'email', content: buildEmailExport() })}>
                <div className="tap-export-card-icon">✉️</div>
                <div className="tap-export-card-title">Email Export</div>
                <div className="tap-export-card-desc">Plain text with ASCII pricing tables. Copy and paste into any email client.</div>
              </div>
              <div className="tap-export-card" onClick={() => { exportPDF(state); showToast('Print window opened'); }}>
                <div className="tap-export-card-icon">🖨️</div>
                <div className="tap-export-card-title">Export PDF</div>
                <div className="tap-export-card-desc">Opens print preview in new tab; save as PDF using browser dialog.</div>
              </div>
              <div className="tap-export-card" onClick={() => setModal({ type: 'html', content: buildHTMLExport(state) })}>
                <div className="tap-export-card-icon">📋</div>
                <div className="tap-export-card-title">Copy HTML Source</div>
                <div className="tap-export-card-desc">Copy the full self-contained HTML to save and print manually.</div>
              </div>
            </div>

            <div className="tap-section-title" style={{ marginTop: 8 }}>Pitch Summary</div>
            <div className="tap-card">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
                <div>
                  <div className="tap-label" style={{ marginBottom: 8 }}>Client</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f2f8', marginBottom: 4 }}>{state.clientName || '—'}</div>
                  <div style={{ fontSize: 12, color: '#4a5578' }}>{state.clientEmail || ''}</div>
                </div>
                <div>
                  <div className="tap-label" style={{ marginBottom: 8 }}>Active Underlyings</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {activeTickers.map(t => <span key={t.symbol} className="tap-tag tap-tag-blue">{t.symbol}</span>)}
                    {activeTickers.length === 0 && <span style={{ color: '#4a5578', fontSize: 13 }}>No data loaded</span>}
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div className="tap-label" style={{ marginBottom: 8 }}>Product Parameters</div>
                  <table className="tap-prod-table"><tbody>{(state.productRows || []).slice(0, 3).map((r, i) => <tr key={i}><td>{r.key}</td><td>{r.val}</td></tr>)}</tbody></table>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div className="tap-label" style={{ marginBottom: 8 }}>Pricing Grids in Export</div>
                  {Object.entries(state.showGrids).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: v ? '#a0aec0' : '#4a5578' }}>
                      <span className={`tap-dot ${v ? 'tap-dot-green' : 'tap-dot-gray'}`} />
                      {{ rc: 'Autocall RC', snowball: 'Snowball', bonus: 'Bonus Note', cpn: 'CPN' }[k]}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="tap-nav">
              <button className="tap-btn tap-btn-secondary" onClick={() => set({ step: 3 })}>← Back</button>
              <button className="tap-btn tap-btn-secondary" onClick={() => { if (window.confirm('Reset all data?')) { if (typeof window !== 'undefined') localStorage.removeItem('tap_state_v3'); setState(DEFAULT_STATE) } }}>🗑 Reset</button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="tap-modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="tap-modal">
            <div className="tap-modal-header">
              <div className="tap-modal-title">
                {modal.type === 'email' ? '✉️ Email Export' : '📋 HTML Source'}
              </div>
              <button className="tap-btn tap-btn-secondary tap-btn-sm" onClick={() => setModal(null)}>✕ Close</button>
            </div>
            <div className="tap-modal-body">
              {modal.type === 'email' && <pre className="tap-export-preview">{modal.content}</pre>}
              {modal.type === 'html' && (
                <div>
                  <div style={{ fontSize: 12, color: '#6b7a99', marginBottom: 12, lineHeight: 1.7 }}>
                    Copy → save as <code style={{ background: '#141824', padding: '1px 5px', borderRadius: 3, color: '#a78bfa' }}>pitch.html</code> → open in browser → Ctrl/Cmd+P → Save as PDF
                  </div>
                  <pre className="tap-export-preview" style={{ maxHeight: 340 }}>{modal.content}</pre>
                </div>
              )}
            </div>
            <div className="tap-modal-footer">
              <button className="tap-btn tap-btn-primary" onClick={() => copyToClipboard(modal.content, modal.type)}>📋 Copy to Clipboard</button>
              <button className="tap-btn tap-btn-secondary" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
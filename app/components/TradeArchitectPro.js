'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { buildHTMLExport, buildEmailExport } from '../lib/htmlExport'

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
  sgToken: null,
  sgTokenExpiry: null,
  logoUrl: '',
}

// ─── AI CALL — hits our own secure Next.js API route, not Anthropic directly ─
async function callClaude(prompt, noWebSearch = false) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, noWebSearch }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.text || ''
}

// ─── DIRECT SG MARKETS CLIENT (implicit-flow token from browser) ─────────────
const SG_PRODUCT_CONFIG = {
  rc:       { productType: 'ReverseConvertible', productSubtype: 'BarrierReverseConvertible', solvingMode: 'RecallCoupon', wrapper: 'Note' },
  snowball: { productType: 'Autocall',            productSubtype: 'Phoenix',                  solvingMode: 'RecallCoupon', wrapper: 'Note' },
  bonus:    { productType: 'Participation',       productSubtype: 'BonusCertificate',         solvingMode: 'Bonus',        wrapper: 'Note' },
  cpn:      { productType: 'Participation',       productSubtype: 'CUOSingle',                solvingMode: 'CapLevel',     wrapper: 'Note' },
}

async function callSGPriceDirect(productKey, { underlyings, maturityMonths, barrier, currency }, token) {
  const config = SG_PRODUCT_CONFIG[productKey]
  if (!config) throw new Error(`Unknown product type: ${productKey}`)
  const quotePayload = {
    variationParameters: {
      ...config,
      underlying: underlyings.map(sym => ({ id: `${sym} UW`, idType: 'Bloomberg' })),
      maturityValue: { currentValue: { value: maturityMonths, unit: 'Month' } },
      currency, notionalAmount: 1000000, strike: 100, kiBarrier: barrier,
      recallThreshold: 100, couponFrequency: 'FourPerYear', recallStartPeriod: 1,
    },
  }
  const quoteRes = await fetch('https://sp-api.sgmarkets.com/api/v1/quotes', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(quotePayload),
  })
  const quoteText = await quoteRes.text()
  if (!quoteRes.ok) throw new Error(`SG quote failed (${quoteRes.status}): ${quoteText}`)
  const { QuoteId } = JSON.parse(quoteText)
  if (!QuoteId) throw new Error('SG did not return a QuoteId')
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(r => setTimeout(r, 2000))
    const pollRes = await fetch(`https://sp-api.sgmarkets.com/api/v1/quote/${QuoteId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!pollRes.ok) continue
    const quote = await pollRes.json()
    if (quote.Status === 'Quoted') {
      const value = quote.SolvedValue ?? quote.RecallCoupon ?? quote.Bonus ?? quote.CapLevel ?? quote.Value ?? null
      if (value === null) throw new Error('SG returned Quoted status but no solved value field')
      return value
    }
    if (['Error', 'Failed', 'Rejected'].includes(quote.Status))
      throw new Error(`SG quote ${quote.Status}: ${quote.ErrorMessage || 'no details'}`)
  }
  throw new Error('SG quote timed out after 20 seconds')
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
.rec-btn{width:100%;padding:13px 20px;background:#b38559;color:#202a3e;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:.04em;margin-top:8px;transition:opacity .2s}
.rec-btn:hover{opacity:.88}
.rec-product-name{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600;color:#202a3e;line-height:1.2;margin-bottom:8px}
.rec-confidence-high{display:inline-block;background:#b38559;color:#fff;font-size:10px;font-weight:700;padding:3px 10px;border-radius:3px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:16px}
.rec-confidence-med{display:inline-block;background:#6b7a99;color:#fff;font-size:10px;font-weight:700;padding:3px 10px;border-radius:3px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:16px}
.rec-justification{font-size:13px;color:#444;line-height:1.8;padding:14px 16px;background:#f9f9f9;border-left:3px solid #202a3e;margin-bottom:18px}
.rec-section-title{font-size:10px;font-weight:700;color:#202a3e;letter-spacing:.1em;text-transform:uppercase;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
.rec-params{background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:16px}
.rec-param-row{display:flex;justify-content:space-between;padding:8px 14px;font-size:12px;border-bottom:1px solid #f5f5f5}
.rec-param-row:last-child{border-bottom:none}
.rec-param-key{color:#6b7280}
.rec-param-val{font-weight:600;color:#202a3e;font-family:${MONO}}
.rec-apply-btn{width:100%;padding:11px;background:#202a3e;color:#b38559;border:1px solid #b38559;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.04em;margin-bottom:16px;transition:background .15s}
.rec-apply-btn:hover{background:#2e3c56}
.rec-why-btn{background:none;border:none;cursor:pointer;font-size:12px;color:#b38559;font-weight:600;padding:6px 0;display:flex;align-items:center;gap:6px;width:100%;border-top:1px solid #e2e8f0;padding-top:12px}
.rec-why-list{margin-top:10px;display:flex;flex-direction:column;gap:6px}
.rec-why-item{display:flex;gap:10px;padding:8px 12px;background:#f9f9f9;border-left:2px solid #e2e8f0;border-radius:0 4px 4px 0}
.rec-why-product{font-size:10px;font-weight:700;color:#202a3e;min-width:80px;text-transform:uppercase;letter-spacing:.04em;padding-top:1px}
.rec-why-reason{font-size:11px;color:#6b7280;line-height:1.6}
.rec-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:64px 20px;color:#6b7a99;font-size:13px;gap:16px}
.rec-loading-icon{font-size:32px;animation:spin .8s linear infinite;display:inline-block}
.sg-bar{display:flex;align-items:center;gap:12px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 20px;margin-bottom:24px;flex-wrap:wrap}
.sg-brand{font-size:13px;font-weight:800;color:#e2000b;letter-spacing:.02em;white-space:nowrap}
.sg-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.03em;white-space:nowrap}
.sg-badge-ok{background:#f0fdf4;color:#059669;border:1px solid #86efac}
.sg-badge-no{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}
.sg-badge-expired{background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5}
.sg-expiry{font-size:11px;color:#6b7280;flex:1;min-width:0}
.sg-connect-btn{background:#ea580c;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Montserrat',sans-serif;letter-spacing:.03em;white-space:nowrap;transition:background .15s}
.sg-connect-btn:hover{background:#c2410c}
.sg-disconnect-btn{background:#ffffff;color:#6b7280;border:1px solid #e2e8f0;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:500;cursor:pointer;font-family:'Montserrat',sans-serif;white-space:nowrap;transition:background .15s}
.sg-disconnect-btn:hover{background:#f3f4f5}
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

function RecCard({ data, onApply }) {
  const [showWhy, setShowWhy] = useState(false)
  const paramLabels = {
    tenor: 'Maturity', barrier: 'Barrier Level', couponFrequency: 'Coupon Frequency',
    autocallFrequency: 'Autocall', protection: 'Capital Protection',
  }
  return (
    <div>
      <div className="rec-product-name">{data.recommended}</div>
      <span className={data.confidence === 'High' ? 'rec-confidence-high' : 'rec-confidence-med'}>
        {data.confidence} Confidence
      </span>
      <div className="rec-justification">{data.justification}</div>
      <div className="rec-section-title">Suggested Parameters</div>
      <div className="rec-params">
        {Object.entries(data.suggestedParams || {}).map(([k, v]) => (
          <div key={k} className="rec-param-row">
            <span className="rec-param-key">{paramLabels[k] || k}</span>
            <span className="rec-param-val">{v}</span>
          </div>
        ))}
      </div>
      <button className="rec-apply-btn" onClick={onApply}>✓ Apply Parameters to Product Table</button>
      {data.whyNotOthers && (
        <>
          <button className="rec-why-btn" onClick={() => setShowWhy(p => !p)}>
            Why not the others? {showWhy ? '▲' : '▼'}
          </button>
          {showWhy && (
            <div className="rec-why-list">
              {Object.entries(data.whyNotOthers).map(([prod, reason]) => (
                <div key={prod} className="rec-why-item">
                  <span className="rec-why-product">{prod}</span>
                  <span className="rec-why-reason">{reason}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
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
  const [rec, setRec] = useState({ open: false, loading: false, data: null })

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

  const handleRecommendation = useCallback(async () => {
    const loaded = state.tickers.filter(t => t.symbol && t.data)
    if (loaded.length < 2) return
    setRec({ open: true, loading: true, data: null })
    const tickerLines = loaded.map(t => {
      const p = t.data
      const pos = Math.round(((p.price - p.low52) / (p.high52 - p.low52)) * 100)
      return `${t.symbol}:\n- Current price: ${p.price} | Change: ${p.change}%\n- 52W Low: ${p.low52} | 52W High: ${p.high52}\n- 52W Position: ${pos}% (0=at low, 100=at high)\n- Implied Volatility: ${p.iv}%`
    }).join('\n')
    const prompt = `You are a senior structured products advisor. Analyse this basket and recommend the single most suitable structured product for current market conditions.

BASKET DATA:
${tickerLines}

ANALYSIS FRAMEWORK:
- High IV (>35%) on majority of basket → favours income products (RC, Snowball) as option premium is rich
- Low IV (<20%) → favours participation products (Bonus, CPN) as protection is cheaper
- Basket at low 52W position (<30%) → potential bounce, favour Bonus Note or Autocall with aggressive barriers
- Basket at high 52W position (>70%) → downside risk, favour capital protection or conservative barriers
- Mixed IV with moderate 52W position → Snowball offers best risk/reward

PRODUCTS AVAILABLE:
1. Autocall Reverse Convertible — income, quarterly coupon, KI barrier
2. Snowball (Phoenix) — memory coupon, autocall, suitable for range markets
3. Bonus Note — participation + protection if barrier not touched
4. Capital Protected Note (CPN) — full capital protection, upside participation

Respond ONLY in this exact JSON format:
{
  "recommended": "Autocall RC",
  "confidence": "High",
  "justification": "3-4 sentence explanation referencing the actual IV and 52W data",
  "suggestedParams": {
    "tenor": "24M",
    "barrier": "65%",
    "couponFrequency": "Quarterly",
    "autocallFrequency": "Quarterly from month 6",
    "protection": "60%"
  },
  "whyNotOthers": {
    "product2": "reason",
    "product3": "reason",
    "product4": "reason"
  }
}`
    try {
      const raw = await callClaude(prompt, true)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const data = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
      setRec({ open: true, loading: false, data })
    } catch (err) {
      setRec({ open: false, loading: false, data: null })
      showToast('Recommendation error: ' + (err?.message || 'Unknown'))
    }
  }, [state.tickers])

  const applyRecommendation = useCallback(() => {
    const sp = rec.data?.suggestedParams
    if (!sp) return
    const newRows = [
      { key: 'Maturity', val: sp.tenor || '24 Months' },
      { key: 'Worst-of (WO) Barrier', val: sp.barrier || '70%' },
      { key: 'Autocall Barrier', val: '100%' },
      { key: 'Protection Barrier', val: sp.protection || sp.barrier || '60%' },
      { key: 'Coupon Barrier', val: sp.barrier || '70%' },
      { key: 'Coupon Frequency', val: sp.couponFrequency || 'Quarterly' },
      { key: 'Autocall', val: sp.autocallFrequency || 'Quarterly from month 6' },
    ]
    setState(prev => ({ ...prev, productRows: newRows }))
    setRec(prev => ({ ...prev, open: false }))
    showToast('Parameters applied from AI recommendation')
  }, [rec.data])

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

    const tokenValid = state.sgToken && state.sgTokenExpiry && Date.now() < state.sgTokenExpiry
    if (!tokenValid) {
      showToast('Please connect SG Markets first')
      set({ step: 1 })
      return
    }

    setSgLoading(prev => ({ ...prev, [productKey]: true }))
    const maturityRow = state.productRows.find(r => r.key.toLowerCase().includes('maturity'))
    const maturityMonths = parseInt(maturityRow?.val) || 24
    const barrierRow = state.productRows.find(r => r.key.toLowerCase().includes('barrier'))
    const barrierPct = parseFloat((barrierRow?.val || '70%').replace('%', '').trim())
    const barrier = isNaN(barrierPct) ? 0.70 : barrierPct / 100
    try {
      const value = await callSGPriceDirect(
        productKey,
        { underlyings: activeSymbols, maturityMonths, barrier, currency: state.pricingCurrency },
        state.sgToken
      )
      const pct = typeof value === 'number' ? (value * 100).toFixed(2) + '% p.a.' : String(value)
      setSgLivePrices(prev => ({ ...prev, [productKey]: pct }))
      showToast('Live price received: ' + pct)
    } catch (err) {
      console.error('SG price error:', err)
      showToast('SG pricing error: ' + (err?.message || 'Unknown error'))
    } finally {
      setSgLoading(prev => ({ ...prev, [productKey]: false }))
    }
  }, [state])

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
            {(() => {
              const connected = state.sgToken && state.sgTokenExpiry && Date.now() < state.sgTokenExpiry
              const expired = state.sgToken && state.sgTokenExpiry && Date.now() >= state.sgTokenExpiry
              const minsLeft = connected ? Math.max(0, Math.round((state.sgTokenExpiry - Date.now()) / 60000)) : 0
              const [sgPasteUrl, setSgPasteUrl] = React.useState('')
              const [sgAwaitingPaste, setSgAwaitingPaste] = React.useState(false)

              const openSGLogin = () => {
                window.open(
                  'https://sso.sgmarkets.com/sgconnect/oauth2/authorize?' + new URLSearchParams({
                    response_type: 'token',
                    client_id: '9da710fa-a553-476e-88eb-36383c8da680',
                    redirect_uri: 'https://sgme-sp-api.azureedge.net/oauth2-redirect.html',
                    scope: 'api.sgmarkets-execution-structured-products.v1',
                    nonce: 'faeafaeafaeaf'
                  }),
                  '_blank'
                )
                setSgAwaitingPaste(true)
                setSgPasteUrl('')
              }

              const submitPastedUrl = () => {
                const hash = sgPasteUrl.split('#')[1]
                if (hash) {
                  const params = new URLSearchParams(hash)
                  const token = params.get('access_token')
                  const expiresIn = params.get('expires_in')
                  if (token) {
                    const expiry = Date.now() + parseInt(expiresIn || '600') * 1000
                    setState(prev => ({ ...prev, sgToken: token, sgTokenExpiry: expiry }))
                    setSgAwaitingPaste(false)
                    setSgPasteUrl('')
                    showToast('SG Markets connected ✓')
                    return
                  }
                }
                showToast('Could not find access_token in URL — please try again')
              }

              return (
                <div className="sg-bar" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                    <span className="sg-brand">SG Markets</span>
                    {connected ? (
                      <>
                        <span className="sg-badge sg-badge-ok">● Connected</span>
                        <span className="sg-expiry">Token expires in {minsLeft}m ({new Date(state.sgTokenExpiry).toLocaleTimeString()})</span>
                        <button className="sg-disconnect-btn" onClick={() => { set({ sgToken: null, sgTokenExpiry: null }); setSgAwaitingPaste(false) }}>Disconnect</button>
                      </>
                    ) : (
                      <>
                        <span className={`sg-badge ${expired ? 'sg-badge-expired' : 'sg-badge-no'}`}>
                          {expired ? '● Token expired' : '● Not connected'}
                        </span>
                        <span className="sg-expiry">{expired ? 'Your session expired — reconnect to continue pricing' : 'Connect to fetch live prices in Step 3'}</span>
                        <button className="sg-connect-btn" onClick={openSGLogin}>{expired ? 'Reconnect' : 'Connect to SG Markets'}</button>
                      </>
                    )}
                  </div>
                  {sgAwaitingPaste && !connected && (
                    <div style={{ width: '100%', background: '#1a2235', border: '1px solid #2e3a52', borderRadius: 4, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ margin: 0, fontSize: 12, color: '#a0aec0', lineHeight: 1.5 }}>
                        After logging in, you will be redirected to a page. Copy the full URL from your browser address bar and paste it here.
                      </p>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#b38559', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Paste the full redirect URL from the new tab
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          style={{ flex: 1, background: '#202a3e', border: '1px solid #2e3a52', borderRadius: 3, padding: '7px 10px', fontSize: 12, color: '#e2e8f0', outline: 'none', fontFamily: 'monospace' }}
                          placeholder="https://sgme-sp-api.azureedge.net/oauth2-redirect.html#access_token=..."
                          value={sgPasteUrl}
                          onChange={e => setSgPasteUrl(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && submitPastedUrl()}
                        />
                        <button className="sg-connect-btn" onClick={submitPastedUrl}>Connect</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
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
                  <label className="tap-label">Bank Logo <span style={{ fontWeight: 400, color: '#4a5578' }}>(optional — appears in export header)</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="file" accept="image/*" style={{ fontSize: 12, color: '#a0aec0' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => set({ logoUrl: ev.target.result })
                        reader.readAsDataURL(file)
                      }} />
                    {state.logoUrl && <img src={state.logoUrl} alt="logo preview" style={{ height: 32, objectFit: 'contain', border: '1px solid #1e2840', borderRadius: 2, background: '#fff', padding: 2 }} />}
                    {state.logoUrl && <button className="tap-btn tap-btn-secondary tap-btn-sm" style={{ color: '#f87171' }} onClick={() => set({ logoUrl: '' })}>Remove</button>}
                  </div>
                </div>
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

            {activeTickers.length >= 2 && (
              <button className="rec-btn" onClick={handleRecommendation}>
                🎯 Get AI Product Recommendation
              </button>
            )}

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
              <div className="tap-export-card" onClick={() => setModal({ type: 'email', content: buildEmailExport(state) })}>
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

      {rec.open && (
        <div className="tap-modal-overlay" onClick={e => e.target === e.currentTarget && !rec.loading && setRec(prev => ({ ...prev, open: false }))}>
          <div className="tap-modal" style={{ maxWidth: 600 }}>
            <div className="tap-modal-header">
              <div className="tap-modal-title">🎯 AI Product Recommendation</div>
              {!rec.loading && <button className="tap-btn tap-btn-secondary tap-btn-sm" onClick={() => setRec(prev => ({ ...prev, open: false }))}>✕ Close</button>}
            </div>
            <div className="tap-modal-body">
              {rec.loading ? (
                <div className="rec-loading">
                  <span className="rec-loading-icon">⟳</span>
                  <div>Analysing market conditions…</div>
                  <div style={{ fontSize: 11, color: '#4a5578' }}>Evaluating IV levels, 52W positioning, and basket characteristics</div>
                </div>
              ) : rec.data ? (
                <RecCard data={rec.data} onApply={applyRecommendation} />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
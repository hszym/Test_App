// Plain JS — no JSX, no 'use client'. Safe to contain raw HTML template strings.

const RC_STRIKES = ['50%', '60%', '70%', '80%']
const TENORS = ['12M', '18M', '24M', '36M']
const SNOWBALL_BARRIERS = ['50/5%', '60/6%', '70/7%', '80/8%']
const BONUS_BARRIERS = ['50%', '60%', '70%', '80%']
const BONUS_CAPS = { '12M': '125%', '18M': '137.5%', '24M': '150%', '36M': '175%' }
const CPN_PROTECTIONS = ['85%', '90%', '95%', '100%']

function pos52w(price, low, high) {
  if (!price || !low || !high || high === low) return 50
  return Math.round(((price - low) / (high - low)) * 100)
}

function fmt(n, dec = 2) {
  if (n == null) return '\u2014'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function asciiTable(title, rowLabels, colLabels, grid) {
  const colW = 10, rowW = 16
  const sep = '+' + '-'.repeat(rowW) + colLabels.map(() => '+' + '-'.repeat(colW)).join('') + '+'
  let out = title + '\n' + sep + '\n'
  out += '|' + ''.padEnd(rowW) + colLabels.map(c => '|' + c.padEnd(colW)).join('') + '|\n' + sep + '\n'
  rowLabels.forEach((r, ri) => {
    out += '|' + r.padEnd(rowW) + colLabels.map((_, ci) => '|' + (grid?.[ri]?.[ci] || '\u2014').padEnd(colW)).join('') + '|\n'
  })
  return out + sep + '\n'
}

const EXPORT_CSS = `
@page { size: A4; margin: 15mm }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
body { font-family: 'Montserrat', sans-serif; color: #333; background: #fff; font-size: 11px; line-height: 1.8; -webkit-print-color-adjust: exact; print-color-adjust: exact }

.page { max-width: 794px; margin: 0 auto; page-break-after: always }
.page-last { page-break-after: avoid }

.doc-header { background: #202a3e; padding: 18px 40px; display: flex; align-items: center; justify-content: space-between; position: relative }
.doc-header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: #b38559 }
.doc-header-sm { padding: 10px 40px }
.header-logo-img { height: 36px; object-fit: contain }
.header-logo-text { font-family: 'Cormorant Garamond', serif; font-size: 22px; color: #fff; font-weight: 600; letter-spacing: 0.02em }
.doc-header-sm .header-logo-text { font-size: 15px }
.header-right { text-align: right }
.header-type { font-size: 10px; font-weight: 600; color: #b38559; letter-spacing: 0.18em; text-transform: uppercase }
.header-date { font-size: 10px; color: rgba(255,255,255,0.65); margin-top: 3px }

.content { padding: 32px 40px 0 }
h2 { font-family: 'Cormorant Garamond', serif; font-size: 19px; font-weight: 600; color: #202a3e; margin: 0 0 14px; padding-left: 14px; border-left: 3px solid #b38559; line-height: 1.2 }
.section { margin-bottom: 28px }

.thesis-block { font-size: 11px; color: #444; line-height: 1.85; padding: 16px 20px; background: #f9f9f9; border: 1px solid #ebebeb }

.tickers { padding-top: 4px }
.ticker-row { display: flex; gap: 28px; align-items: flex-start; padding: 18px 0; border-bottom: 1px solid #f0e8dc }
.ticker-row:last-child { border-bottom: none }
.ticker-left { flex: 0 0 170px }
.ticker-right { flex: 1 }
.ticker-symbol { font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 700; color: #202a3e }
.ticker-cur { display: inline-block; font-size: 9px; color: #999; background: #f3f4f5; padding: 2px 5px; border-radius: 2px; margin-left: 6px; vertical-align: middle }
.ticker-price { font-size: 14px; font-weight: 700; font-family: 'Courier New', monospace; color: #202a3e; margin-top: 6px }
.ticker-chg { font-size: 11px; font-family: 'Courier New', monospace; font-weight: 600 }
.pos { color: #059669 }
.neg { color: #dc2626 }
.ticker-iv { font-size: 10px; color: #888; margin-top: 4px }
.bar-wrap { position: relative; height: 4px; background: linear-gradient(90deg, #dc2626 0%, #f59e0b 50%, #059669 100%); border-radius: 2px; margin: 10px 0 4px }
.bar-dot { position: absolute; top: -3px; width: 10px; height: 10px; background: #202a3e; border: 2px solid #fff; border-radius: 50%; transform: translateX(-50%); box-shadow: 0 1px 3px rgba(0,0,0,0.25) }
.bar-labels { display: flex; justify-content: space-between; font-size: 9px; color: #bbb; font-family: 'Courier New', monospace }

.note-block { margin-top: 7px; padding: 7px 10px; font-size: 10px; line-height: 1.65 }
.note-block strong { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 3px }
.note-block p { margin: 0; color: #444 }
.note-bull { background: #f0fdf4; border-left: 2px solid #059669 }
.note-bull strong { color: #059669 }
.note-bear { background: #fef2f2; border-left: 2px solid #dc2626 }
.note-bear strong { color: #dc2626 }
.note-entry { background: #f0f4ff; border-left: 2px solid #3b5bdb }
.note-entry strong { color: #3b5bdb }

.param-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 4px }
.param-card { background: #fff; border-top: 3px solid #b38559; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 14px 16px; page-break-inside: avoid }
.param-card-title { font-family: 'Cormorant Garamond', serif; font-size: 15px; color: #202a3e; font-weight: 600; margin-bottom: 9px; padding-bottom: 7px; border-bottom: 1px solid #f0f0f0 }
.param-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; border-bottom: 1px solid #f8f8f8 }
.param-row:last-child { border-bottom: none }
.param-key { color: #777; flex: 1; padding-right: 8px }
.param-val { color: #202a3e; font-family: 'Courier New', monospace; font-weight: 600; white-space: nowrap }

.pricing-wrap { padding: 22px 40px 0 }
.pricing-block { margin-bottom: 12px; page-break-inside: avoid }
.pricing-title { font-family: 'Cormorant Garamond', serif; font-size: 13px; font-weight: 600; color: #202a3e; margin: 0 0 6px; display: flex; align-items: center; gap: 10px }
.currency-tag { font-family: 'Montserrat', sans-serif; font-size: 9px; font-weight: 700; color: #b38559; letter-spacing: 0.08em; background: #fdf6ee; padding: 2px 7px; border: 1px solid #e8d5b5 }
.payoff-badge { display: inline-block; background: #202a3e; color: #fff; font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 700; border-radius: 3px; padding: 2px 8px; margin-bottom: 6px }
.payoff-desc { font-size: 10px; color: #555; font-style: italic; padding: 5px 10px; border-left: 2px solid #b38559; line-height: 1.5; margin-bottom: 8px }
.pricing-grid-wrap { display: grid; gap: 12px }
.pricing-grid-wrap.count-4 { grid-template-columns: 1fr 1fr }
.pricing-grid-wrap.count-3 { grid-template-columns: 1fr 1fr }
.pricing-grid-wrap.count-3 .pricing-block:last-child { grid-column: 1/-1 }
.pg-table { width: 100%; border-collapse: collapse; margin-bottom: 4px }
.pg-table thead tr { background: #202a3e; border-bottom: 2px solid #b38559 }
.pg-table th { color: #fff; padding: 6px 10px; text-align: center; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; font-family: 'Montserrat', sans-serif; border: 1px solid #2e3c56 }
.pg-table th.label-head { text-align: left }
.pg-table td { padding: 6px 10px; text-align: center; font-family: 'Courier New', monospace; font-size: 10px; color: #202a3e; border: 1px solid #e8e8e8; background: #fff }
.pg-table tr:nth-child(even) td { background: #f3f4f5 }
.pg-table td.row-label { text-align: left; color: #555; font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 10px }
.cap-note { font-size: 8px; color: #aaa; display: block; margin-top: 1px }

.doc-footer { margin: 20px 40px 32px; padding-top: 12px; border-top: 1px solid #b38559 }
.disclaimer { font-size: 9px; color: #aaa; line-height: 1.7; font-style: italic }
.footer-brand { font-size: 9px; color: #ccc; text-align: right; margin-top: 6px; font-weight: 500; letter-spacing: 0.04em }

@media print {
  .page { page-break-after: always }
  .page-last { page-break-after: avoid }
  body { font-size: 10px }
}
`

export function buildHTMLExport(state) {
  const activeTickers = state.tickers.filter(t => t.symbol && t.data)
  const dateStr = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })

  // Logo: base64 DataURL or text fallback
  const logoHTML = state.logoUrl
    ? `<img class="header-logo-img" src="${state.logoUrl}" alt="logo">`
    : `<span class="header-logo-text">${state.bankName || 'PLURIMI WEALTH'}</span>`

  const headerFull = `
  <div class="doc-header">
    ${logoHTML}
    <div class="header-right">
      <div class="header-type">Structured Product Pitch</div>
      <div class="header-date">${dateStr}</div>
    </div>
  </div>`

  const headerSm = `
  <div class="doc-header doc-header-sm">
    ${logoHTML}
    <div class="header-right">
      <div class="header-type">Structured Product Pitch</div>
      <div class="header-date">${dateStr}</div>
    </div>
  </div>`

  const tickerRowsHTML = activeTickers.map(t => {
    const p = t.data
    const pct = pos52w(p?.price, p?.low52, p?.high52)
    return `
    <div class="ticker-row">
      <div class="ticker-left">
        <div>
          <span class="ticker-symbol">${t.symbol}</span>
          ${t.currency ? `<span class="ticker-cur">${t.currency}</span>` : ''}
        </div>
        <div class="ticker-price">${fmt(p?.price)}</div>
        <div class="ticker-chg ${(p?.change ?? 0) >= 0 ? 'pos' : 'neg'}">${(p?.change ?? 0) >= 0 ? '\u25b2' : '\u25bc'} ${fmt(Math.abs(p?.change ?? 0))}%</div>
        <div class="ticker-iv">IV: ${fmt(p?.iv)}%</div>
        <div class="bar-wrap"><div class="bar-dot" style="left:${pct}%"></div></div>
        <div class="bar-labels"><span>${fmt(p?.low52)}</span><span>52W Range</span><span>${fmt(p?.high52)}</span></div>
      </div>
      <div class="ticker-right">
        ${t.bullCase ? `<div class="note-block note-bull"><strong>Bull Case</strong><p>${t.bullCase}</p></div>` : ''}
        ${t.bearCase ? `<div class="note-block note-bear"><strong>Bear Case</strong><p>${t.bearCase}</p></div>` : ''}
        ${t.entryNote ? `<div class="note-block note-entry"><strong>Entry Note</strong><p>${t.entryNote}</p></div>` : ''}
      </div>
    </div>`
  }).join('')

  const rows = state.productRows || []
  const cardTitles = ['Product Terms', 'Structure', 'Risk Parameters', 'Return Profile']
  const n = rows.length
  const paramCardsHTML = n === 0 ? '' : (() => {
    const chunkSize = Math.ceil(n / Math.min(4, n))
    const cards = []
    for (let i = 0; i < 4 && i * chunkSize < n; i++) {
      const chunk = rows.slice(i * chunkSize, (i + 1) * chunkSize)
      if (chunk.length === 0) break
      cards.push(`
    <div class="param-card">
      <div class="param-card-title">${cardTitles[i]}</div>
      ${chunk.map(r => `<div class="param-row"><span class="param-key">${r.key}</span><span class="param-val">${r.val}</span></div>`).join('')}
    </div>`)
    }
    return cards.join('')
  })()

  const gridHTML = (label, rowLabels, colLabels, grid, caps) => {
    const headerCells = colLabels.map(c => `<th>${c}</th>`).join('')
    const bodyRows = rowLabels.map((r, ri) =>
      `<tr><td class="row-label">${r}</td>` +
      colLabels.map((c, ci) =>
        `<td>${grid?.[ri]?.[ci] || '\u2014'}${caps ? `<span class="cap-note">Cap ${caps[c]}</span>` : ''}</td>`
      ).join('') +
      '</tr>'
    ).join('')
    return `<table class="pg-table"><thead><tr><th class="label-head">${label}</th>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`
  }

  const payoffInfo = {
    rc:       { badge: 'Autocall RC',           desc: 'Guaranteed coupon paid quarterly. Autocall at 100% quarterly from month 6. Capital at risk below the strike.' },
    snowball: { badge: 'Snowball',               desc: 'Memory coupon accumulates if not paid. Autocall at 100% from month 6. Barrier observed at maturity, Strike 100%.' },
    bonus:    { badge: 'Bonus Capped',           desc: '100% capital protection if underlying never touches barrier. Bonus return up to cap level. Full downside if barrier is breached.' },
    cpn:      { badge: 'Capital Protected Note', desc: 'Capital protection at maturity. Upside participation on the worst of. Strike equal to Protection. No cap' },
  }

  const gridDefs = {
    rc:       { label: 'Strike',         rows: RC_STRIKES,       title: 'Autocall Reverse Convertible' },
    snowball: { label: 'Barrier/Coupon', rows: SNOWBALL_BARRIERS, title: 'Snowball' },
    bonus:    { label: 'Barrier',         rows: BONUS_BARRIERS,   title: 'Bonus Note', caps: BONUS_CAPS },
    cpn:      { label: 'Protection',      rows: CPN_PROTECTIONS,  title: 'Capital Protected Note' },
  }

  const activeKeys = ['rc', 'snowball', 'bonus', 'cpn'].filter(k => state.showGrids[k])
  const activeCount = activeKeys.length
  const gridWrapClass = 'pricing-grid-wrap count-' + activeCount
  const pricingHTML = activeKeys.map(k => {
      const def = gridDefs[k]
      const po = payoffInfo[k]
      return `
    <div class="pricing-block">
      <span class="payoff-badge">${po.badge}</span>
      <div class="payoff-desc">${po.desc}</div>
      <div class="pricing-title">${def.title} <span class="currency-tag">${state.pricingCurrency}</span></div>
      ${gridHTML(def.label, def.rows, TENORS, state.pricingGrids[k], def.caps)}
    </div>`
    }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${state.bankName || 'Plurimi Wealth'} \u2014 Structured Product Pitch</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${EXPORT_CSS}</style>
</head>
<body>

<!-- PAGE 1: Investment Thesis + Underlying Assets -->
<div class="page">
  ${headerFull}
  <div class="content">
    <div class="section">
      <h2>Investment Thesis</h2>
      <div class="thesis-block">${(state.thesis || '').replace(/\n/g, '<br>')}</div>
    </div>
    <div class="section">
      <h2>Underlying Assets</h2>
      <div class="tickers">${tickerRowsHTML}</div>
    </div>
  </div>
</div>

<!-- PAGE 2: Basket Dynamics + Product Parameters -->
<div class="page">
  ${headerFull}
  <div class="content">
    <div class="section">
      <h2>Basket Dynamics</h2>
      <div class="thesis-block">${(state.basketDynamics || '').replace(/\n/g, '<br>')}</div>
    </div>
    <div class="section">
      <h2>Product Parameters</h2>
      <div class="param-grid">${paramCardsHTML}</div>
    </div>
  </div>
</div>

<!-- PAGE 3: Indicative Pricing + Footer -->
<div class="page page-last">
  ${headerSm}
  <div class="pricing-wrap">
    <h2>Indicative Pricing</h2>
    <div class="${gridWrapClass}">${pricingHTML}</div>
  </div>
  <div class="doc-footer">
    <div class="disclaimer">${state.disclaimer || ''}</div>
    <div class="footer-brand">Generated by Trade Architect Pro</div>
  </div>
</div>

</body>
</html>`
}

export function buildEmailExport(state) {
  const activeTickers = state.tickers.filter(t => t.symbol)
  let txt = 'INVESTMENT PITCH \u2014 ' + (state.bankName || '') + '\nClient: ' + (state.clientName || '') + ' | ' + (state.clientEmail || '') + '\nDate: ' + new Date().toLocaleDateString('en-GB') + '\n\n'
  txt += '='.repeat(60) + '\nINVESTMENT THESIS\n' + '='.repeat(60) + '\n' + (state.thesis || '') + '\n\n'
  txt += '='.repeat(60) + '\nUNDERLYING ASSETS\n' + '='.repeat(60) + '\n'
  activeTickers.forEach(t => {
    txt += '\n' + t.symbol + ' \u2014 ' + (t.data ? fmt(t.data.price) : 'N/A') + '\n'
    if (t.bullCase) txt += '  Bull: ' + t.bullCase + '\n'
    if (t.bearCase) txt += '  Bear: ' + t.bearCase + '\n'
    if (t.entryNote) txt += '  Entry: ' + t.entryNote + '\n'
  })
  txt += '\n' + '='.repeat(60) + '\nPRODUCT PARAMETERS\n' + '='.repeat(60) + '\n'
  ;(state.productRows || []).forEach(r => { txt += '  ' + (r.key || '').padEnd(24) + ': ' + (r.val || '') + '\n' })
  txt += '\n'
  if (state.showGrids.rc) txt += asciiTable('AUTOCALL RC', RC_STRIKES, TENORS, state.pricingGrids.rc) + '\n'
  if (state.showGrids.snowball) txt += asciiTable('SNOWBALL', SNOWBALL_BARRIERS, TENORS, state.pricingGrids.snowball) + '\n'
  if (state.showGrids.bonus) txt += asciiTable('BONUS NOTE', BONUS_BARRIERS, TENORS, state.pricingGrids.bonus) + '\n'
  if (state.showGrids.cpn) txt += asciiTable('CPN', CPN_PROTECTIONS, TENORS, state.pricingGrids.cpn) + '\n'
  txt += '\n' + '\u2500'.repeat(60) + '\n' + state.disclaimer
  return txt
}

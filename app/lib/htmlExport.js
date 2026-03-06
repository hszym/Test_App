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

export function buildHTMLExport(state) {
  const activeTickers = state.tickers.filter(t => t.symbol && t.data)
  const dateStr = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })

  const gridHTML = (label, rowLabels, colLabels, grid, caps) => {
    const headerCells = colLabels.map(c => '<th>' + c + '</th>').join('')
    const rows = rowLabels.map((r, ri) =>
      '<tr class="' + (ri % 2 === 0 ? 'row-even' : 'row-odd') + '">' +
        '<td class="row-label">' + r + '</td>' +
        colLabels.map((c, ci) =>
          '<td>' + (grid?.[ri]?.[ci] || '\u2014') + (caps ? '<br/><span class="cap-note">Cap ' + caps[c] + '</span>' : '') + '</td>'
        ).join('') +
      '</tr>'
    ).join('')
    return '<table class="pg-table"><thead><tr><th class="row-label-head">' + label + '</th>' + headerCells + '</tr></thead><tbody>' + rows + '</tbody></table>'
  }

  const stockCards = activeTickers.map(t => {
    const p = t.data
    const pct = pos52w(p?.price, p?.low52, p?.high52)
    return '<div class="stock-card">' +
      '<div class="sc-header">' +
        '<span class="sc-sym">' + t.symbol + '</span>' +
        '<span class="sc-cur">' + t.currency + '</span>' +
        '<span class="sc-price">' + fmt(p?.price) + '</span>' +
        '<span class="sc-chg ' + (p?.change >= 0 ? 'pos' : 'neg') + '">' + (p?.change >= 0 ? '\u25b2' : '\u25bc') + ' ' + fmt(Math.abs(p?.change)) + '%</span>' +
      '</div>' +
      '<div class="sc-bar-wrap"><div class="sc-bar-fill" style="width:' + pct + '%"></div><div class="sc-bar-dot" style="left:' + pct + '%"></div></div>' +
      '<div class="sc-range">' + fmt(p?.low52) + ' <span class="sc-range-label">52W Range</span> ' + fmt(p?.high52) + '</div>' +
      '<div class="sc-iv">Implied Volatility: <strong>' + fmt(p?.iv) + '%</strong></div>' +
      (t.bullCase ? '<div class="sc-section sc-bull"><strong>Bull Case</strong><p>' + t.bullCase + '</p></div>' : '') +
      (t.bearCase ? '<div class="sc-section sc-bear"><strong>Bear Case</strong><p>' + t.bearCase + '</p></div>' : '') +
      (t.entryNote ? '<div class="sc-section sc-entry"><strong>Entry Note</strong><p>' + t.entryNote + '</p></div>' : '') +
    '</div>'
  }).join('')

  const prodRows = (state.productRows || []).map((r, i) =>
    '<tr class="' + (i % 2 === 0 ? 'row-even' : 'row-odd') + '"><td class="param-key">' + r.key + '</td><td class="param-val">' + r.val + '</td></tr>'
  ).join('')

  const gridTitles = { rc: 'Autocall Reverse Convertible', snowball: 'Snowball', bonus: 'Bonus Note', cpn: 'Capital Protected Note' }
  const pricingSections = [
    state.showGrids.rc ? { key: 'rc', title: gridTitles.rc } : null,
    state.showGrids.snowball ? { key: 'snowball', title: gridTitles.snowball } : null,
    state.showGrids.bonus ? { key: 'bonus', title: gridTitles.bonus } : null,
    state.showGrids.cpn ? { key: 'cpn', title: gridTitles.cpn } : null,
  ].filter(Boolean)

  const pricingHTML = pricingSections.map(({ key, title }) => {
    const grids = {
      rc: gridHTML('Strike', RC_STRIKES, TENORS, state.pricingGrids.rc),
      snowball: gridHTML('Barrier/Coupon', SNOWBALL_BARRIERS, TENORS, state.pricingGrids.snowball),
      bonus: gridHTML('Barrier', BONUS_BARRIERS, TENORS, state.pricingGrids.bonus, BONUS_CAPS),
      cpn: gridHTML('Protection', CPN_PROTECTIONS, TENORS, state.pricingGrids.cpn),
    }
    return '<div class="section pricing-section">' +
      '<h3>' + title + ' <span class="currency-tag">' + state.pricingCurrency + '</span></h3>' +
      grids[key] +
    '</div>'
  }).join('')

  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<title>' + (state.bankName || 'Plurimi Wealth') + ' \u2014 Structured Product Pitch</title>\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n' +
'<style>\n' +
'@page { size: A4; margin: 20mm }\n' +
'*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }\n' +
'body { font-family: \'Montserrat\', sans-serif; color: #333; background: #fff; font-size: 11px; line-height: 1.8; -webkit-print-color-adjust: exact; print-color-adjust: exact }\n' +
'\n' +
'/* Cover page */\n' +
'.cover { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #fff; page-break-after: always }\n' +
'.cover-top { background: #202a3e; padding: 64px 72px 56px; color: #fff; position: relative }\n' +
'.cover-top::after { content: \'\'; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: #b38559 }\n' +
'.cover-bank-name { font-family: \'Cormorant Garamond\', serif; font-size: 56px; font-weight: 600; color: #fff; letter-spacing: .02em; line-height: 1.1; margin-bottom: 24px }\n' +
'.cover-gold-line { width: 72px; height: 2px; background: #b38559; margin-bottom: 20px }\n' +
'.cover-subtitle { font-family: \'Montserrat\', sans-serif; font-size: 11px; font-weight: 600; color: #b38559; letter-spacing: .2em; text-transform: uppercase }\n' +
'.cover-body { flex: 1; padding: 56px 72px; display: flex; flex-direction: column; justify-content: flex-end }\n' +
'.cover-meta { border-top: 1px solid #e2e8f0; padding-top: 28px; display: flex; justify-content: space-between; align-items: flex-end }\n' +
'.cover-meta-label { font-size: 9px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #999; margin-bottom: 6px }\n' +
'.cover-client-name { font-family: \'Cormorant Garamond\', serif; font-size: 24px; font-weight: 600; color: #202a3e }\n' +
'.cover-client-email { font-size: 11px; color: #777; margin-top: 4px }\n' +
'.cover-date-block { text-align: right }\n' +
'.cover-date { font-size: 12px; color: #555 }\n' +
'.cover-prepared-by { font-size: 10px; color: #aaa; margin-top: 4px; font-style: italic }\n' +
'\n' +
'/* Main content */\n' +
'.page { max-width: 794px; margin: 0 auto; padding: 60px 72px }\n' +
'h2 { font-family: \'Cormorant Garamond\', serif; font-size: 20px; font-weight: 600; color: #202a3e; margin: 40px 0 14px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0 }\n' +
'h3 { font-family: \'Cormorant Garamond\', serif; font-size: 16px; font-weight: 600; color: #202a3e; margin: 28px 0 10px }\n' +
'.section { page-break-inside: avoid; margin-bottom: 12px }\n' +
'\n' +
'/* Thesis */\n' +
'.thesis { font-size: 11px; color: #333; line-height: 1.8; padding: 20px 24px; border-left: 3px solid #202a3e; background: #f9f9f9 }\n' +
'\n' +
'/* Basket dynamics */\n' +
'.basket-text { font-size: 11px; color: #444; line-height: 1.8 }\n' +
'\n' +
'/* Stock cards */\n' +
'.stock-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin: 12px 0 }\n' +
'.stock-card { border: 1px solid #e2e8f0; border-top: 3px solid #202a3e; padding: 14px; page-break-inside: avoid }\n' +
'.sc-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; flex-wrap: wrap }\n' +
'.sc-sym { font-family: \'Cormorant Garamond\', serif; font-size: 20px; font-weight: 700; color: #202a3e }\n' +
'.sc-cur { font-size: 9px; color: #999; background: #f3f4f5; padding: 2px 6px; border-radius: 2px }\n' +
'.sc-price { font-size: 13px; font-weight: 600; font-family: \'Courier New\', monospace; margin-left: auto; color: #202a3e }\n' +
'.sc-chg { font-size: 10px; font-family: \'Courier New\', monospace; font-weight: 600 }\n' +
'.sc-chg.pos { color: #059669 } .sc-chg.neg { color: #dc2626 }\n' +
'.sc-bar-wrap { position: relative; height: 3px; background: #e2e8f0; border-radius: 2px; margin: 8px 0 }\n' +
'.sc-bar-fill { position: absolute; top: 0; left: 0; height: 100%; background: linear-gradient(90deg, #dc2626, #f59e0b, #059669); border-radius: 2px }\n' +
'.sc-bar-dot { position: absolute; top: -4px; width: 10px; height: 10px; background: #202a3e; border: 2px solid #fff; border-radius: 50%; transform: translateX(-50%); box-shadow: 0 1px 3px rgba(0,0,0,.2) }\n' +
'.sc-range { font-size: 9px; color: #aaa; font-family: \'Courier New\', monospace; display: flex; justify-content: space-between; margin-top: 2px }\n' +
'.sc-range-label { color: #ccc }\n' +
'.sc-iv { font-size: 10px; color: #666; margin-top: 6px }\n' +
'.sc-section { margin-top: 10px; padding: 8px 10px; font-size: 10px; line-height: 1.7 }\n' +
'.sc-section strong { display: block; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 3px }\n' +
'.sc-section p { margin: 0; color: #444 }\n' +
'.sc-bull { background: #f0fdf4; border-left: 2px solid #059669 } .sc-bull strong { color: #059669 }\n' +
'.sc-bear { background: #fef2f2; border-left: 2px solid #dc2626 } .sc-bear strong { color: #dc2626 }\n' +
'.sc-entry { background: #f5f7ff; border-left: 2px solid #202a3e } .sc-entry strong { color: #202a3e }\n' +
'\n' +
'/* Product parameters */\n' +
'.prod-table { width: 100%; border-collapse: collapse; margin: 8px 0 }\n' +
'.prod-table tr.row-even { background: #f9f9f9 } .prod-table tr.row-odd { background: #fff }\n' +
'.param-key { padding: 10px 16px; font-size: 11px; color: #666; font-weight: 500; width: 45%; border-bottom: 1px solid #f0f0f0 }\n' +
'.param-val { padding: 10px 16px; font-size: 11px; color: #202a3e; font-family: \'Courier New\', monospace; font-weight: 600; border-bottom: 1px solid #f0f0f0 }\n' +
'\n' +
'/* Pricing tables */\n' +
'.pricing-section { page-break-inside: avoid }\n' +
'.currency-tag { font-family: \'Montserrat\', sans-serif; font-size: 10px; font-weight: 600; color: #b38559; letter-spacing: .06em }\n' +
'.pg-table { width: 100%; border-collapse: collapse; margin: 8px 0 }\n' +
'.pg-table thead tr { background: #202a3e; border-bottom: 3px solid #b38559 }\n' +
'.pg-table th { color: #fff; padding: 10px 16px; text-align: center; font-size: 10px; font-weight: 600; letter-spacing: .06em; font-family: \'Montserrat\', sans-serif; border: 1px solid #2e3c56 }\n' +
'.pg-table th.row-label-head { text-align: left }\n' +
'.pg-table tr.row-even { background: #f9f9f9 } .pg-table tr.row-odd { background: #fff }\n' +
'.pg-table td { padding: 10px 16px; text-align: center; font-family: \'Courier New\', monospace; font-size: 11px; color: #202a3e; border: 1px solid #e8e8e8 }\n' +
'.row-label { text-align: left !important; color: #666; font-weight: 500; font-family: \'Montserrat\', sans-serif; font-size: 10px }\n' +
'.cap-note { font-size: 8px; color: #aaa; display: block; margin-top: 1px }\n' +
'\n' +
'/* Disclaimer */\n' +
'.disclaimer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #aaa; line-height: 1.7; font-style: italic }\n' +
'\n' +
'@media print {\n' +
'  body { font-size: 10px }\n' +
'  .cover { min-height: 297mm; page-break-after: always }\n' +
'  .page { padding: 0; max-width: 100% }\n' +
'  .stock-cards { grid-template-columns: repeat(3, 1fr) }\n' +
'  .section { page-break-inside: avoid }\n' +
'}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'\n' +
'<div class="cover">\n' +
'  <div class="cover-top">\n' +
'    <div class="cover-bank-name">' + (state.bankName || 'Plurimi Wealth') + '</div>\n' +
'    <div class="cover-gold-line"></div>\n' +
'    <div class="cover-subtitle">Structured Product Pitch</div>\n' +
'  </div>\n' +
'  <div class="cover-body">\n' +
'    <div class="cover-meta">\n' +
'      <div>\n' +
'        <div class="cover-meta-label">Prepared for</div>\n' +
'        <div class="cover-client-name">' + (state.clientName || 'Institutional Client') + '</div>\n' +
'        ' + (state.clientEmail ? '<div class="cover-client-email">' + state.clientEmail + '</div>' : '') + '\n' +
'      </div>\n' +
'      <div class="cover-date-block">\n' +
'        <div class="cover-date">' + dateStr + '</div>\n' +
'        <div class="cover-prepared-by">Trade Architect Pro</div>\n' +
'      </div>\n' +
'    </div>\n' +
'  </div>\n' +
'</div>\n' +
'\n' +
'<div class="page">\n' +
'  <div class="section">\n' +
'    <h2>Investment Thesis</h2>\n' +
'    <div class="thesis">' + (state.thesis || '').replace(/\n/g, '<br/>') + '</div>\n' +
'  </div>\n' +
'\n' +
'  <div class="section">\n' +
'    <h2>Underlying Assets</h2>\n' +
'    <div class="stock-cards">' + stockCards + '</div>\n' +
'  </div>\n' +
'\n' +
'  <div class="section">\n' +
'    <h2>Basket Dynamics</h2>\n' +
'    <div class="basket-text">' + (state.basketDynamics || '').replace(/\n/g, '<br/>') + '</div>\n' +
'  </div>\n' +
'\n' +
'  <div class="section">\n' +
'    <h2>Product Parameters</h2>\n' +
'    <table class="prod-table"><tbody>' + prodRows + '</tbody></table>\n' +
'  </div>\n' +
'\n' +
'  ' + (pricingHTML ? '<div class="section"><h2>Indicative Pricing</h2></div>' + pricingHTML : '') + '\n' +
'\n' +
'  <div class="disclaimer">' + state.disclaimer + '</div>\n' +
'</div>\n' +
'\n' +
'</body>\n' +
'</html>'
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

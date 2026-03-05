# CLAUDE.md — Trade Architect Pro

## Project Overview
Internal tool built for Plurimi Wealth bankers to streamline the creation of structured product pitch materials.

A banker can:
- Input a basket of up to 3 underlying stocks
- Pull live market data
- Use AI to generate institutional-grade investment narratives (thesis, bull/bear cases, basket dynamics)
- Define product parameters (maturity, barriers, coupon, etc.)
- Input indicative pricing across 4 product types:
  - Autocall Reverse Convertible
  - Snowball
  - Bonus Note
  - Capital Protected Note
- Export a polished HTML pitch document (print-to-PDF ready)
- Export a plain-text version formatted for email

**Goal:** Cut pitch production time from hours to minutes.

---

## Stack
- Framework: Next.js
- AI: Anthropic API (Claude) via server-side API route
- Deployment: Vercel

---

## Brand & Design — Plurimi Wealth
Always respect the following visual identity:

| Token | Value |
|---|---|
| Primary Navy | `#202a3e` |
| Light Background | `#f3f4f5` |
| Gold Accent | `#b38559` |
| White | `#ffffff` |
| Heading Font | Cormorant Garamond |
| Body Font | Montserrat |

Design should feel **institutional, elegant, and minimal** — think private bank, not fintech startup.

Claude Code has **flexibility to propose design improvements** as long as they stay within the brand palette and typography. Avoid bright colors, rounded "app-like" UI, or anything that feels consumer-grade.

---

## Code Conventions
- All API calls to Anthropic must go through a **server-side Next.js API route** (never expose API keys client-side)
- Keep components modular and clearly named
- Prefer clean, readable code over clever abstractions

---

## Environment Variables
- `ANTHROPIC_API_KEY` — stored in `.env.local`, never committed to git
- Additional keys (market data APIs, etc.) to be documented here as added

---

## Off-limits
- Never commit `.env.local`
- Files/folders to protect will be specified as the project grows
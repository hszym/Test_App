import './globals.css'

export const metadata = {
  title: 'Trade Architect Pro',
  description: 'Internal tool for Plurimi Wealth bankers to create structured product pitch materials',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Boomerang Sidekick',
  description: 'Your guide to Boomerang training & processes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}


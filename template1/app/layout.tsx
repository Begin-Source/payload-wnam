import type { Metadata } from 'next'
import { Inter, Merriweather } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { GlobalMobileStickyBar } from '@/components/global-mobile-sticky-bar'

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter'
})

const merriweather = Merriweather({ 
  subsets: ["latin"],
  weight: ['300', '400', '700', '900'],
  variable: '--font-merriweather'
})

export const metadata: Metadata = {
  title: {
    default: 'TechReview Pro — Independent Product Reviews & Buying Guides',
    template: '%s | TechReview Pro'
  },
  description: 'Independent product reviews written by experienced experts. We test everything hands-on and never accept payment for coverage.',
  keywords: ['product reviews', 'buying guide', 'best products', 'amazon recommendations', 'honest reviews'],
  authors: [{ name: 'TechReview Pro' }],
  creator: 'TechReview Pro',
  publisher: 'TechReview Pro',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://techreviewpro.com',
    siteName: 'TechReview Pro',
    title: 'TechReview Pro — Independent Product Reviews & Buying Guides',
    description: 'Independent product reviews written by experienced experts. We test everything hands-on.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TechReview Pro — Independent Product Reviews & Buying Guides',
    description: 'Independent product reviews written by experienced experts. We test everything hands-on.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${merriweather.variable} bg-background`}>
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 pb-24 lg:pb-0">
          {children}
        </main>
        <Footer />
        <GlobalMobileStickyBar />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

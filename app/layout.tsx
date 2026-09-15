import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'RAIZEL AI — Your AI. Your Ideas. Your Power.',
  description:
    'Modern, lightning-fast AI chat application powered by Rindri API Gateway with Claude Opus, Sonnet, Grok, DeepSeek, Kimi, and GLM models.',
  keywords: ['AI Chat', 'RAIZEL AI', 'Claude Opus', 'DeepSeek', 'Grok', 'Rindri API'],
  authors: [{ name: 'RAIZEL AI' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#08090d',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#08090d] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}

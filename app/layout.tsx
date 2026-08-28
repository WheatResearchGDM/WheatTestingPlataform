import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://rede-ensaios-rs-demo-2026.gdmseeds-whe-7678.chatgpt.site'),
  title: 'Rede de Ensaios RS',
  description: 'Gestão integrada da rede experimental de trigo do Rio Grande do Sul.',
  openGraph: {
    title: 'Rede de Ensaios RS',
    description: 'Pesquisa que conecta o campo.',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rede de Ensaios RS',
    description: 'Pesquisa que conecta o campo.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

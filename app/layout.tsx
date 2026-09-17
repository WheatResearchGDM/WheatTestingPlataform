import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://wheatresearchgdm.github.io/WheatTestingPlataform/'),
  title: 'Field Wheat Testing',
  description: 'Plataforma de gerenciamento operacional da rede de ensaios de trigo.',
  manifest: 'manifest.webmanifest',
  applicationName: 'Field Wheat Testing',
  appleWebApp: { capable: true, title: 'Field Wheat Testing', statusBarStyle: 'default' },
  openGraph: {
    title: 'Field Wheat Testing',
    description: 'Gerenciamento operacional da rede de ensaios de trigo.',
    images: [{ url: 'og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Field Wheat Testing',
    description: 'Gerenciamento operacional da rede de ensaios de trigo.',
    images: ['og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f6b45',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

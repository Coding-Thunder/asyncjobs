import './globals.css';
import { siteConfig } from '../lib/siteConfig';

export const metadata = {
  title: `${siteConfig.brand.name} — ${siteConfig.hero.headline.join(' ')}`,
  description: siteConfig.hero.subtext,
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Local Gig Marketplace — Admin',
  description: 'Platform operations dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

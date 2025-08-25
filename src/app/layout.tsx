import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DRAW Coin Bot UI',
  description: 'Dashboard for DRAW Coin Telegram bot users',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

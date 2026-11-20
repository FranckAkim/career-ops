import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const inter = localFont({ src: '../assets/Inter-Latin-Variable.woff2', variable: '--font-inter', display: 'swap' });
export const metadata: Metadata = { title: 'Career Workspace', description: 'Review your career profile and prepare your next move.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={inter.variable}><body>{children}</body></html>;
}

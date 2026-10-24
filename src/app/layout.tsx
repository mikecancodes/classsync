import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'ClassSync · Your academic life, in sync', description: 'A calmer way to manage your courses, assignments, and next big idea.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

import type { Metadata } from 'next';
import './globals.css';
import './frontend-refresh.css';
import ClassSync from '@/components/class-sync';
export const metadata: Metadata = { title: 'ClassSync · Your academic life, in sync', description: 'A calmer way to manage your courses, assignments, and next big idea.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><ClassSync />{children}</body></html>; }

'use client';

import Link from 'next/link';
import { Brain, ChevronDown, Moon, Sun } from 'lucide-react';

export function WorkspaceHeader({ path, dark, onTheme }: { path: string; dark: boolean; onTheme: () => void }) {
  const tabs = [{ href: '/', label: 'Home' }, { href: '/assignments', label: 'My Assignments' }, { href: '/notes', label: 'Lecture Notes / Material' }];
  return <header className="workspace-header">
    <div className="workspace-brand-area"><button className="icon-button" onClick={onTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><Link href="/" className="brand" aria-label="ClassSync home"><span className="brand-mark"><Brain size={24} /></span>Class<span>Sync</span></Link></div>
    <nav className="workspace-tabs" aria-label="Main navigation">
      {tabs.map(tab => <Link key={tab.href} href={tab.href} aria-current={path === tab.href ? 'page' : undefined}>{tab.label}</Link>)}
      <details className="workspace-more"><summary>More <ChevronDown size={14} /></summary><div>
        <Link href="/courses">My courses</Link><Link href="/calendar">Calendar</Link><Link href="/grades">Grade calculator</Link><Link href="/assistant">Study tools</Link><Link href="/settings">Settings & account</Link>
      </div></details>
    </nav>

  </header>;
}

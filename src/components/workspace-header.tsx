'use client';

import Link from 'next/link';
import { BookOpen, Brain, CalendarDays, Calculator, ChevronDown, Home, ListTodo, Moon, Plug, Settings, Sparkles, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/assignments', label: 'My Assignments', icon: ListTodo },
  { href: '/notes', label: 'Lecture Notes / Material', icon: BookOpen },
];
const morePages = [
  { href: '/courses', label: 'My classes', icon: BookOpen },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/grades', label: 'Grade calculator', icon: Calculator },
  { href: '/assistant', label: 'Study tools', icon: Sparkles },
  { href: '/connect', label: 'Connect your school', icon: Plug },
  { href: '/settings', label: 'Settings & account', icon: Settings },
];

export function WorkspaceHeader({ path, dark, onTheme }: { path: string; dark: boolean; onTheme: () => void }) {
  const moreActive = morePages.some(page => path === page.href || path.startsWith(`${page.href}/`));

  return (
    <header className="workspace-header">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="workspace-brand-area">
        <Link href="/" className="brand" aria-label="ClassSync home">
          <span className="brand-mark"><Brain size={23} aria-hidden="true" /></span>
          Class<span>Sync</span>
        </Link>
        <span className="workspace-tagline">All your classes. One place.</span>
      </div>
      <nav className="workspace-tabs" aria-label="Main navigation">
        {tabs.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
            <Icon size={16} aria-hidden="true" />{label}
          </Link>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className={`workspace-more ${moreActive ? 'is-active' : ''}`}>
              More<ChevronDown size={15} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" collisionPadding={12}>
            {morePages.map(({ href, label, icon: Icon }, index) => (
              <div key={href}>
                {index === 4 && <DropdownMenuSeparator />}
                <DropdownMenuItem asChild>
                  <Link href={href} aria-current={path === href || path.startsWith(`${href}/`) ? 'page' : undefined}>
                    <Icon size={16} aria-hidden="true" />{label}
                  </Link>
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <Button variant="ghost" size="icon" className="theme-toggle" onClick={onTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </Button>
    </header>
  );
}

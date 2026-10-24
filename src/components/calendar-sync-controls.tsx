'use client';
import { LoaderCircle, RefreshCw } from 'lucide-react';

type Props = {
  url: string; onChange: (url: string) => void; onSync: () => void;
  syncing: boolean; expanded?: boolean; controls?: string; label?: string;
};

// Calendar-only subscription input and sync action.
export function CalendarSyncControls({ url, onChange, onSync, syncing, expanded, controls, label = 'Sync classes' }: Props) {
  return <div className="calendar-sync-controls">
    <label className="calendar-link-field" htmlFor="school-calendar-link">School calendar link
      <input id="school-calendar-link" type="url" value={url} onChange={event => onChange(event.target.value)} disabled={syncing} maxLength={4096} autoComplete="off" spellCheck={false} placeholder="Paste your .ics subscription link" />
    </label>
    <button type="button" className="primary-button" aria-expanded={expanded} aria-controls={controls} disabled={syncing} onClick={onSync}>
      {syncing ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}{label}
    </button>
  </div>;
}

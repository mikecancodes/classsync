'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, LoaderCircle, RefreshCw } from 'lucide-react';
import { AcademicState, Assignment, dateKey, formatDate } from '@/lib/model';
import type { ExtensionHandle } from '@/lib/extension-bridge';

export function SyncSidebar({ data, extension, onComplete, onAddCourse }: { data: AcademicState; extension: ExtensionHandle; onComplete: (assignment: Assignment) => void; onAddCourse: () => void }) {
  const [open, setOpen] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [course, setCourse] = useState('all');
  const syncing = extension.progressState === 'running';
  const rows = data.assignments.filter(item => item.status !== 'done' && (course === 'all' || item.courseId === course))
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));

  // With a connected school, ask the extension to read D2L; results arrive as a review dialog
  function sync() {
    if (extension.connected) {
      setSyncFailed(false); setNeedsConnect(false);
      extension.send('sync-now');
      setOpen(data.courses.length > 0);
      return;
    }
    const missing = data.courses.length === 0;
    setSyncFailed(missing);
    setNeedsConnect(true);
    setOpen(!missing);
  }

  return <aside className="sync-sidebar" aria-label="Sync and to-do list">
    <h2>Sync / To-do list</h2>
    <p>{extension.connected && extension.school ? `Connected to ${extension.school} D2L.` : 'Your next steps, all together.'}</p>
    <button className="primary-button" aria-expanded={open} aria-controls="sidebar-todos" disabled={syncing} onClick={sync}>{syncing ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}Sync classes</button>
    {extension.connected && extension.progress && <p role="status" className={extension.progressState === 'error' || extension.progressState === 'needs_login' ? 'sync-failure' : 'muted'}>{extension.progress}</p>}
    {syncFailed && data.courses.length === 0 && <p role="alert" className="sync-failure">Sync unsuccessful. Please log in to your student portal to sync classes.</p>}
    {needsConnect && !extension.connected && <p className="sync-instruction">To sync from D2L, <Link href="/connect">connect your school</Link> first. Your classes come in right after you sign in to D2L.</p>}
    {data.courses.length === 0 && <button className="secondary-button" onClick={onAddCourse} style={{marginTop: 12, width: '100%'}}>Add class</button>}
    {!open && !syncFailed && <div className="sync-sidebar-placeholder">Open your to-do list to review current coursework.</div>}
    {open && <div id="sidebar-todos"><label>Class<select aria-label="Filter sidebar to-do list by class" value={course} onChange={event => setCourse(event.target.value)}><option value="all">All classes</option>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="sync-sidebar-count">{rows.length} to do</div><ul>{rows.map(item => <li key={item.id}><button className="focus-check" aria-label={`Complete ${item.title}`} onClick={() => onComplete(item)}><Check size={13} /></button><div><strong>{item.title}</strong><span>{data.courses.find(course => course.id === item.courseId)?.code}</span><small className={item.due < dateKey() ? 'board-late' : ''}>{item.due < dateKey() ? 'Overdue · ' : ''}{formatDate(item.due)}</small></div></li>)}</ul>{!rows.length && <p>You’re all caught up.</p>}</div>}
  </aside>;
}

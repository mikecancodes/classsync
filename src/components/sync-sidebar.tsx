'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ListTodo, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { AcademicState, Assignment, dateKey, formatDate } from '@/lib/model';
import type { ExtensionHandle } from '@/lib/extension-bridge';
import { Button } from '@/components/ui/button';

type Props = {
  data: AcademicState;
  extension: ExtensionHandle;
  onComplete: (assignment: Assignment) => void;
  onAddCourse: () => void;
};

export function SyncSidebar({ data, extension, onComplete, onAddCourse }: Props) {
  const [open, setOpen] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [course, setCourse] = useState('all');
  const syncing = extension.progressState === 'running';
  const today = dateKey();
  const rows = data.assignments.filter(item => item.status !== 'done' && (course === 'all' || item.courseId === course))
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));

  function sync() {
    if (extension.connected) {
      setSyncFailed(false);
      setNeedsConnect(false);
      extension.send('sync-now');
      setOpen(data.courses.length > 0);
      return;
    }
    const missing = data.courses.length === 0;
    setSyncFailed(missing);
    setNeedsConnect(true);
    setOpen(!missing);
  }

  return (
    <aside className="sync-sidebar" aria-label="Sync and to-do list">
      <div className="sync-sidebar-heading"><ListTodo size={19} aria-hidden="true" /><h2>Sync / To-do</h2></div>
      <p>{extension.connected && extension.school ? `Connected to ${extension.school} D2L.` : 'A little focus for your day.'}</p>
      <Button className="sync-action" aria-expanded={open} aria-controls="sidebar-todos" disabled={syncing} onClick={sync}>
        {syncing ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}{syncing ? 'Syncing classes…' : 'Sync classes'}
      </Button>
      {extension.connected && extension.progress && <p role="status" className={extension.progressState === 'error' || extension.progressState === 'needs_login' ? 'sync-failure' : 'muted'}>{extension.progress}</p>}
      {syncFailed && data.courses.length === 0 && <p role="alert" className="sync-failure">Sync unsuccessful. Please log in to your student portal to sync classes.</p>}
      {needsConnect && !extension.connected && <p className="sync-instruction">Connect to D2L, then review your classes before adding them.</p>}
      {!extension.connected && <Link className="sync-connect" href="/connect">Connect your school<ArrowRight size={14} /></Link>}
      {data.courses.length === 0 && <Button variant="outline" className="sync-add-class" onClick={onAddCourse}><Plus size={16} />Add class manually</Button>}
      {!open && !syncFailed && (
        <div className="sync-sidebar-placeholder">
          <span className="empty-state-icon"><ListTodo size={23} strokeWidth={1.6} aria-hidden="true" /></span>
          <h3>{data.courses.length ? 'Your next steps, in one place' : 'Start with your classes'}</h3>
          <p>{data.courses.length ? 'Sync classes to open your to-do list, ordered by due date.' : 'Connect your school or add a class to start organizing your coursework.'}</p>
        </div>
      )}
      <div id="sidebar-todos" hidden={!open}>
        <label>Class
          <select aria-label="Filter sidebar to-do list by class" value={course} onChange={event => setCourse(event.target.value)}>
            <option value="all">All classes</option>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="sync-sidebar-count" role="status">{rows.length} to do<span>Due date order</span></div>
        <ul>{rows.map(item => (
          <li key={item.id}>
            <button className="focus-check" aria-label={`Complete ${item.title}`} onClick={() => onComplete(item)}><Check size={14} /></button>
            <div><Link className="sync-assignment-link" href={`/courses/${item.courseId}`}>{item.title}</Link><span>{data.courses.find(itemCourse => itemCourse.id === item.courseId)?.code}</span><small className={item.due < today ? 'board-late' : ''}>{item.due < today ? 'Overdue · ' : ''}{formatDate(item.due)}</small></div>
          </li>
        ))}</ul>
        {!rows.length && <div className="sync-caught-up"><Check size={20} /><p>No pending assignments{course !== 'all' ? ' in this class' : ''}.</p></div>}
        <Link className="sync-connect" href="/assignments">View all assignments<ArrowRight size={14} /></Link>
      </div>
    </aside>
  );
}

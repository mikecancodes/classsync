'use client';

import { useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { AcademicState, Assignment, dateKey, formatDate } from '@/lib/model';

export function SyncSidebar({ data, onComplete, onAddCourse }: { data: AcademicState; onComplete: (assignment: Assignment) => void; onAddCourse: () => void }) {
  const [open, setOpen] = useState(false);
  const [course, setCourse] = useState('all');
  const rows = data.assignments.filter(item => item.status !== 'done' && (course === 'all' || item.courseId === course))
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
  return <aside className="sync-sidebar" aria-label="Sync and to-do list">
    <h2>Sync / To-do list</h2>
    <p>Your next steps, all together.</p>
    <button className="primary-button" aria-expanded={open} aria-controls="sidebar-todos" onClick={() => setOpen(true)}><RefreshCw size={15} />Sync classes</button>
    {data.courses.length === 0 && <button className="secondary-button" onClick={onAddCourse} style={{marginTop: 12, width: '100%'}}>Add class</button>}
    {!open && <div className="sync-sidebar-placeholder">Open your to-do list to review current coursework.</div>}
    {open && <div id="sidebar-todos"><label>Class<select aria-label="Filter sidebar to-do list by class" value={course} onChange={event => setCourse(event.target.value)}><option value="all">All classes</option>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="sync-sidebar-count">{rows.length} to do</div><ul>{rows.map(item => <li key={item.id}><button className="focus-check" aria-label={`Complete ${item.title}`} onClick={() => onComplete(item)}><Check size={13} /></button><div><strong>{item.title}</strong><span>{data.courses.find(course => course.id === item.courseId)?.code}</span><small className={item.due < dateKey() ? 'board-late' : ''}>{item.due < dateKey() ? 'Overdue · ' : ''}{formatDate(item.due)}</small></div></li>)}</ul>{!rows.length && <p>You’re all caught up.</p>}</div>}
  </aside>;
}

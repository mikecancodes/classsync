'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { AcademicState, Assignment, dateKey, formatDate } from '@/lib/model';

export function SyncTodo({ data, onComplete, onClose }: { data: AcademicState; onComplete: (assignment: Assignment) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [course, setCourse] = useState('all');
  const today = dateKey();
  const rows = data.assignments.filter(item => item.status !== 'done' && (course === 'all' || item.courseId === course))
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);

  return <dialog ref={dialog} className="assignment-modal sync-todo" aria-labelledby="sync-todo-title" onCancel={onClose}>
    <div className="section-heading"><h2 id="sync-todo-title">To-do list</h2><button className="icon-button" aria-label="Close to-do list" onClick={onClose}><X size={20} /></button></div>
    <p className="muted">Review your current coursework, one step at a time.</p>
    <label>Class<select aria-label="Filter to-do list by class" value={course} onChange={event => setCourse(event.target.value)}><option value="all">All classes</option>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="sync-todo-count">{rows.length} assignment{rows.length === 1 ? '' : 's'} to do</div>
    <ul>{rows.map(item => <li key={item.id}><button className="focus-check" aria-label={`Complete ${item.title}`} onClick={() => onComplete(item)}><Check size={14} /></button><div><strong>{item.title}</strong><span>{data.courses.find(course => course.id === item.courseId)?.name}</span><small className={item.due < today ? 'board-late' : ''}>{item.due < today ? 'Overdue · ' : ''}{formatDate(item.due)}</small></div></li>)}</ul>
    {!rows.length && <div className="board-empty"><h3>You’re all caught up</h3><p>No incomplete assignments for this selection.</p></div>}
    <div className="modal-actions"><button className="primary-button" onClick={onClose}>Done</button></div>
  </dialog>;
}

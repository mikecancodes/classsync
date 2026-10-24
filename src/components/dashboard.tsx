'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { AcademicState, Assignment, formatDate } from '@/lib/model';
import { filterAnnouncements, type FeedFilters } from '@/lib/feed';

type Props = {
  data: AcademicState;
  today: string;
  onEdit: (assignment: Assignment) => void;
  onComplete: (assignment: Assignment) => void;
  onAnnouncementToggle: (id: string) => void;
};
const initialFilters: FeedFilters = { course: 'all', priority: 'all', read: 'all', sort: 'newest' };

export function Dashboard({ data, today, onEdit, onComplete, onAnnouncementToggle }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const rows = filterAnnouncements(data, filters);
  const pending = data.assignments.filter(item => item.status !== 'done' && (filters.course === 'all' || item.courseId === filters.course))
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
  const unread = data.announcements.filter(item => !item.read).length;
  const filtered = Object.keys(initialFilters).some(key => filters[key as keyof FeedFilters] !== initialFilters[key as keyof FeedFilters]);
  const set = (key: keyof FeedFilters, value: string) => setFilters(current => ({ ...current, [key]: value }));

  return <div className="announcement-board">
    <div className="board-heading"><div><span className="board-eyebrow">YOUR CLASS UPDATES</span><h1>Announcements</h1><p>All your classes. One place.</p></div><span className="board-unread">{unread} unread</span></div>
    <section className="board-filters" aria-label="Announcement filters">
      <span className="filter-symbol"><SlidersHorizontal size={17} /> Filter</span>
      <label>Class<select aria-label="Filter announcements by class" value={filters.course} onChange={event => set('course', event.target.value)}><option value="all">All classes</option>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
      <label>Priority<select aria-label="Filter announcements by priority" value={filters.priority} onChange={event => set('priority', event.target.value)}><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
      <label>Status<select aria-label="Filter announcements by status" value={filters.read} onChange={event => set('read', event.target.value)}><option value="all">All updates</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
      <label>Sort by<select aria-label="Sort announcements" value={filters.sort} onChange={event => set('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Priority first</option></select></label>
      {filtered && <button className="board-reset" onClick={() => setFilters(initialFilters)}>Reset</button>}
    </section>
    <div className="board-feed-label"><span>{rows.length} update{rows.length === 1 ? '' : 's'}</span><span>Demo LMS data</span></div>
    <section className="board-feed" aria-label="Course announcements" aria-live="polite">
      {!rows.length && <div className="board-empty"><h2>No announcements here</h2><p>{data.announcements.length ? 'Try another class or clear your filters.' : 'Use Demo Sync to add sample class updates.'}</p>{filtered && <button className="secondary-button" onClick={() => setFilters(initialFilters)}>Clear filters</button>}</div>}
      {rows.map(item => {
        const course = data.courses.find(course => course.id === item.courseId);
        const priority = item.priority ?? 'medium';
        return <article className={`board-post ${item.read ? 'is-read' : ''}`} key={item.id}>
          <div className="board-post-meta"><Link href={`/courses/${item.courseId}`}><i className={`dot ${course?.color}`} />{course?.name}</Link><span>{item.platform} · Demo</span><time dateTime={item.posted}>{formatDate(item.posted)}</time></div>
          <div className="board-post-title"><h2>{item.title}</h2><span className={`priority-label ${priority}`}>{priority} priority</span></div>
          <p>{item.description}</p>
          <button className="board-read-toggle" aria-pressed={item.read} onClick={() => onAnnouncementToggle(item.id)}>{item.read ? <Check size={14} /> : <span className="unread-dot" />}{item.read ? 'Read · Mark unread' : 'Mark as read'}<span className="sr-only">: {item.title}</span></button>
        </article>;
      })}
    </section>
    <details className="board-deadlines"><summary><span>Assignment deadlines <small>{pending.length} to do{pending.some(item => item.due < today) ? ' · Includes overdue work' : ''}</small></span><ChevronDown size={16} /></summary><ul>{pending.slice(0, 5).map(item => <li key={item.id}><button className="focus-check" aria-label={`Complete ${item.title}`} onClick={() => onComplete(item)}><Check size={14} /></button><button onClick={() => onEdit(item)}>{item.title}</button><span className={item.due < today ? 'board-late' : ''}>{item.due < today ? 'Overdue · ' : ''}{formatDate(item.due)}</span></li>)}</ul>{!pending.length && <p className="muted">No incomplete assignments for this class.</p>}<Link href="/assignments">All assignments <ArrowRight size={14} /></Link></details>
  </div>;
}

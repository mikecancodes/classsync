'use client';

import Link from 'next/link';
import { ArrowRight, Check, CheckCircle2, ChevronDown } from 'lucide-react';
import { AcademicState, Assignment, formatDate } from '@/lib/model';
import { Announcements } from './announcements';
import { DashboardSummary } from './dashboard-summary';

type Props = {
  data: AcademicState;
  today: string;
  onEdit: (assignment: Assignment) => void;
  onComplete: (assignment: Assignment) => void;
  onAnnouncementToggle: (id: string) => void;
};

export function Dashboard({ data, today, onEdit, onComplete, onAnnouncementToggle }: Props) {
  const pending = data.assignments.filter(item => item.status !== 'done')
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const upcoming = pending.filter(item => item.due >= today);
  const overdue = pending.filter(item => item.due < today);
  const unread = data.announcements.filter(item => !item.read).length;

  function rows(assignments: Assignment[]) {
    return assignments.map(item => {
      const course = data.courses.find(course => course.id === item.courseId);
      return <li className="focus-assignment" key={item.id}>
        <button className="focus-check" aria-label={`Complete ${item.title}`} onClick={() => onComplete(item)}><Check size={14} aria-hidden="true" /></button>
        <button className="focus-assignment-title" onClick={() => onEdit(item)}>
          <strong>{item.title}</strong>
          <span><i className={`dot ${course?.color}`} />{course?.name}{item.status === 'progress' && ' · In progress'}</span>
        </button>
        <time className={item.due < today ? 'focus-date overdue' : 'focus-date'} dateTime={item.due}>{item.due === today ? 'Today' : formatDate(item.due)}</time>
      </li>;
    });
  }

  return <div className="focus-dashboard">
    <DashboardSummary data={data} today={today} />
    <section className="focus-deadlines" aria-labelledby="next-up-title">
      <div className="focus-section-heading"><div><h2 id="next-up-title">Next up</h2><p>Your nearest deadlines, in order.</p></div><Link href="/assignments">All assignments <ArrowRight size={15} /></Link></div>
      {overdue.length > 0 && <details className="focus-overdue">
        <summary><span><strong>{overdue.length} overdue</strong> · Review when you’re ready</span><ChevronDown size={16} /></summary>
        <ul>{rows(overdue.slice(0, 5))}</ul>
        {overdue.length > 5 && <Link className="focus-more" href="/assignments">View all assignments <ArrowRight size={14} /></Link>}
      </details>}
      {upcoming.length > 0 ? <ul className="focus-assignment-list">{rows(upcoming.slice(0, 5))}</ul> : <div className="focus-empty"><CheckCircle2 size={26} /><h3>No upcoming deadlines</h3><p>{overdue.length ? 'Your overdue work is listed above.' : 'You’re all caught up. Add an assignment whenever you need to.'}</p></div>}
      {upcoming.length > 5 && <Link className="focus-more" href="/assignments">{upcoming.length - 5} more upcoming · View all <ArrowRight size={14} /></Link>}
    </section>
    <details className="focus-announcements">
      <summary><span>Announcements <small>{unread ? `${unread} unread` : 'All read'}</small></span><ChevronDown size={17} /></summary>
      <Announcements data={data} onToggle={onAnnouncementToggle} compact />
    </details>
    <div className="focus-bottom-links"><Link href="/courses">My courses <ArrowRight size={14} /></Link><Link href="/calendar">Open calendar <ArrowRight size={14} /></Link></div>
  </div>;
}

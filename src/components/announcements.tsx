'use client';

import { Bell, Check, Circle } from 'lucide-react';
import { AcademicState, formatDate } from '@/lib/model';

export function Announcements({ data, onToggle, compact = false }: {
  data: AcademicState;
  onToggle: (id: string) => void;
  compact?: boolean;
}) {
  const rows = [...data.announcements].sort((a, b) => b.posted.localeCompare(a.posted) || a.id.localeCompare(b.id));
  const unread = rows.filter(a => !a.read).length;
  return (
    <section className={`announcement-feed ${compact ? 'compact-feed' : 'panel'}`} aria-label="Course announcements">
      <div className="section-heading">
        <h2><Bell size={17} /> Announcements <span>{unread} unread</span></h2>
        <span className="demo-source">Your classes</span>
      </div>
      {!rows.length && <p className="muted">Your class announcements will appear here when you add them to your workspace.</p>}
      {rows.map(item => (
        <article className={`announcement-item ${item.read ? 'read' : ''}`} key={item.id}>
          <div className="announcement-meta">
            <span>{data.courses.find(c => c.id === item.courseId)?.name}</span>
            <span className={`source-badge ${item.platform.toLowerCase()}`}>{item.platform}</span>
            <time dateTime={item.posted}>{formatDate(item.posted)}</time>
          </div>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <button className="read-toggle" aria-pressed={item.read} onClick={() => onToggle(item.id)}>
            {item.read ? <Check size={13} /> : <Circle size={11} />}
            {item.read ? 'Read · Mark unread' : 'Unread · Mark read'}
            <span className="sr-only">: {item.title}</span>
          </button>
        </article>
      ))}
    </section>
  );
}

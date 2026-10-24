'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Inbox, RotateCcw } from 'lucide-react';
import { AcademicState, formatDate } from '@/lib/model';
import { filterAnnouncements, type FeedFilters } from '@/lib/feed';
import { Button } from '@/components/ui/button';

const initialFilters: FeedFilters = { course: 'all', priority: 'all', read: 'all', sort: 'newest' };

type Props = {
  data: AcademicState;
  onAnnouncementToggle: (id: string) => void;
};

export function Dashboard({ data, onAnnouncementToggle }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const rows = filterAnnouncements(data, filters);
  const unread = data.announcements.filter(item => !item.read).length;
  const filtered = Object.keys(initialFilters).some(key => filters[key as keyof FeedFilters] !== initialFilters[key as keyof FeedFilters]);
  const set = (key: keyof FeedFilters, value: string) => setFilters(current => ({ ...current, [key]: value }));

  return (
    <div className="announcement-board">
      <div className="board-heading">
        <div><h1>Announcements</h1><p>The latest from your classes, all together.</p></div>
        {unread > 0 && <span className="board-unread">{unread} unread</span>}
      </div>
      <section className="board-filters" aria-label="Announcement filters">
        <label>Class
          <select aria-label="Filter announcements by class" value={filters.course} onChange={event => set('course', event.target.value)}>
            <option value="all">All classes</option>
            {data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
        </label>
        <label>Priority
          <select aria-label="Filter announcements by priority" value={filters.priority} onChange={event => set('priority', event.target.value)}>
            <option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </label>
        <label>Status
          <select aria-label="Filter announcements by status" value={filters.read} onChange={event => set('read', event.target.value)}>
            <option value="all">All updates</option><option value="unread">Unread</option><option value="read">Read</option>
          </select>
        </label>
        <label>Sort by
          <select aria-label="Sort announcements" value={filters.sort} onChange={event => set('sort', event.target.value)}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Priority first</option>
          </select>
        </label>
      </section>
      <div className="board-feed-label">
        <span role="status">{rows.length} update{rows.length === 1 ? '' : 's'}{filtered ? ' shown' : ''}</span>
        {filtered && <Button variant="ghost" size="sm" onClick={() => setFilters(initialFilters)}><RotateCcw size={13} />Reset filters</Button>}
      </div>
      <section className="board-feed" aria-label="Course announcements">
        {!rows.length && (
          <div className="board-empty">
            <span className="empty-state-icon"><Inbox size={26} strokeWidth={1.6} aria-hidden="true" /></span>
            <h2>{data.announcements.length ? 'No matching announcements' : 'Your class updates will appear here'}</h2>
            <p>{data.announcements.length ? 'Try a different filter to find what you’re looking for.' : 'Connect your school and review your import to bring in announcements from your classes.'}</p>
            {filtered
              ? <Button variant="outline" onClick={() => setFilters(initialFilters)}>Clear filters</Button>
              : <Button variant="outline" asChild><Link href="/connect">Connect your school<ArrowRight size={15} /></Link></Button>}
          </div>
        )}
        {rows.map(item => {
          const course = data.courses.find(course => course.id === item.courseId);
          const priority = item.priority ?? 'medium';
          return (
            <article className={`board-post ${item.read ? 'is-read' : ''}`} key={item.id}>
              <div className="board-post-meta">
                <Link href={`/courses/${item.courseId}`}><i className={`dot ${course?.color}`} aria-hidden="true" />{course?.name}</Link>
                <span className="board-source">{item.platform}</span>
                <time dateTime={item.posted}>{formatDate(item.posted)}</time>
              </div>
              <div className="board-post-title"><h2>{item.title}</h2></div>
              <p>{item.description}</p>
              <div className="board-post-footer">
                <span className={`priority-label ${priority}`}>{priority} priority</span>
                <button className="board-read-toggle" aria-pressed={item.read} onClick={() => onAnnouncementToggle(item.id)}>
                  {item.read ? <Check size={14} /> : <span className="unread-dot" />}
                  {item.read ? 'Read · Mark unread' : 'Mark as read'}<span className="sr-only">: {item.title}</span>
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

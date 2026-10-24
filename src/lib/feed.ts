import { AcademicState } from './model';

export type FeedFilters = { course: string; priority: string; read: string; sort: string };
const rank = { high: 0, medium: 1, low: 2 };

export function filterAnnouncements(data: AcademicState, filters: FeedFilters) {
  return data.announcements.filter(item =>
    (filters.course === 'all' || item.courseId === filters.course) &&
    (filters.priority === 'all' || (item.priority ?? 'medium') === filters.priority) &&
    (filters.read === 'all' || (filters.read === 'unread' ? !item.read : item.read))
  ).sort((a, b) => {
    if (filters.sort === 'priority') {
      const difference = rank[a.priority ?? 'medium'] - rank[b.priority ?? 'medium'];
      if (difference) return difference;
    }
    return (filters.sort === 'oldest' ? a.posted.localeCompare(b.posted) : b.posted.localeCompare(a.posted)) || a.id.localeCompare(b.id);
  });
}

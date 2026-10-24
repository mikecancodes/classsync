import test from 'node:test';
import assert from 'node:assert/strict';
import { demoState } from '../src/lib/demo';
import { filterAnnouncements } from '../src/lib/feed';
import { stateSchema } from '../src/lib/model';

const all = { course: 'all', priority: 'all', read: 'all', sort: 'newest' };

test('announcement filters combine class, priority, and read state without mutating data', () => {
  const data = demoState();
  data.announcements[0].read = true;
  const snapshot = JSON.stringify(data);
  const course = data.announcements[0].courseId;
  assert.equal(filterAnnouncements(data, { ...all, course, priority: 'high', read: 'read' }).length, 1);
  assert.equal(filterAnnouncements(data, { ...all, course, priority: 'low' }).length, 0);
  assert.equal(filterAnnouncements(data, { ...all, read: 'unread' }).length, 2);
  assert.equal(JSON.stringify(data), snapshot);
});

test('feed sorts deterministically and supports legacy announcements without priority', () => {
  const data = demoState();
  assert.deepEqual(filterAnnouncements(data, { ...all, sort: 'priority' }).map(item => item.priority), ['high', 'medium', 'low']);
  const newest = filterAnnouncements(data, all);
  assert.deepEqual(filterAnnouncements(data, { ...all, sort: 'oldest' }).map(item => item.id), [...newest].reverse().map(item => item.id));
  delete data.announcements[0].priority;
  const migrated = stateSchema.parse(data);
  assert.equal(filterAnnouncements(migrated, { ...all, course: data.announcements[0].courseId, priority: 'medium' }).length, 1);
  assert.equal(stateSchema.safeParse({ ...data, announcements: [{ ...data.announcements[0], priority: 'urgent' }] }).success, false);
});

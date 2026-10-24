import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSchoolCalendar } from '../src/lib/ical';
import { isPublicAddress, normalizeCalendarUrl, resolveCalendarAddress } from '../src/lib/calendar-fetch';
import { eventsOnDate, schoolCalendarSchema } from '../src/lib/calendar-model';
import { migrateWorkspace, emptyWorkspace } from '../src/lib/workspace';
import { stateSchema } from '../src/lib/model';
import { POST } from '../src/app/api/calendar/sync/route';

const now = new Date('2026-10-24T12:00:00Z');
const feed = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ClassSync tests//EN', ...events, 'END:VCALENDAR'].join('\r\n');
const event = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const basic = event('UID:school-1', 'DTSTART;VALUE=DATE:20261025', 'DTEND;VALUE=DATE:20261027', 'SUMMARY:Fall break', 'DESCRIPTION:School closed.');

test('all-day events keep calendar dates and exclusive DTEND across time zones', () => {
  const calendar = parseSchoolCalendar(feed(basic), 'America/Los_Angeles', now);
  assert.equal(calendar.events.length, 1);
  assert.equal(calendar.events[0].startDate, '2026-10-25');
  assert.equal(eventsOnDate(calendar.events, '2026-10-26').length, 1);
  assert.equal(eventsOnDate(calendar.events, '2026-10-27').length, 0);
  assert.equal(calendar.events[0].startAt, null);
});

test('UTC timestamps use the student timezone and midnight endings do not spill into the next day', () => {
  const calendar = parseSchoolCalendar(feed(event('UID:deadline', 'DTSTART:20261025T033000Z', 'DTEND:20261025T040000Z', 'SUMMARY:Review session')), 'America/New_York', now);
  assert.equal(calendar.events[0].startDate, '2026-10-24');
  assert.equal(calendar.events[0].endDate, '2026-10-25');
});

test('IANA recurring local times remain correct across daylight-saving changes', () => {
  const calendar = parseSchoolCalendar(feed(event('UID:weekly', 'DTSTART;TZID=America/New_York:20261025T090000', 'DTEND;TZID=America/New_York:20261025T100000', 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Office hours')), 'America/New_York', now);
  assert.deepEqual(calendar.events.map(item => item.startAt), ['2026-10-25T13:00:00.000Z', '2026-11-01T14:00:00.000Z', '2026-11-08T14:00:00.000Z']);
});

test('recurrence exclusions and moved exceptions produce stable identities and no duplicate occurrences', () => {
  const master = event('UID:lecture', 'DTSTART;VALUE=DATE:20261025', 'DTEND;VALUE=DATE:20261026', 'RRULE:FREQ=DAILY;COUNT=3', 'EXDATE;VALUE=DATE:20261026', 'SUMMARY:Lecture');
  const exception = event('UID:lecture', 'RECURRENCE-ID;VALUE=DATE:20261027', 'DTSTART;VALUE=DATE:20261028', 'DTEND;VALUE=DATE:20261029', 'SUMMARY:Moved lecture');
  const calendar = parseSchoolCalendar(feed(master, exception), 'America/New_York', now);
  assert.deepEqual(calendar.events.map(item => item.startDate), ['2026-10-25', '2026-10-28']);
  assert.equal(new Set(calendar.events.map(item => item.id)).size, 2);
  const again = parseSchoolCalendar(feed(master, exception.replace('Moved lecture', 'Updated lecture')), 'America/New_York', now);
  assert.deepEqual(again.events.map(item => item.id), calendar.events.map(item => item.id));
});

test('duplicate source records update by sequence; cancelled events disappear on refresh', () => {
  const changed = basic.replace('SUMMARY:Fall break', 'SEQUENCE:2\r\nSUMMARY:Updated break');
  const calendar = parseSchoolCalendar(feed(basic, changed), 'America/New_York', now);
  assert.equal(calendar.events.length, 1);
  assert.equal(calendar.events[0].title, 'Updated break');
  assert.equal(parseSchoolCalendar(feed(changed.replace('END:VEVENT', 'STATUS:CANCELLED\r\nEND:VEVENT')), 'America/New_York', now).events.length, 0);
});

test('invalid feeds and excessive recurrence are rejected without returning partial results', () => {
  assert.throws(() => parseSchoolCalendar('<html>Sign in</html>', 'America/New_York', now));
  assert.throws(() => parseSchoolCalendar(feed(event('UID:bad', 'DTSTART:20261025T090000Z', 'RRULE:FREQ=SECONDLY', 'SUMMARY:Bad')), 'UTC', now));
  assert.throws(() => parseSchoolCalendar(feed(basic), 'Invalid/Timezone', now));
});

test('legacy migration preserves coursework and adds an empty calendar; URLs never enter cloud or backup payloads', () => {
  const legacy = { version: 2, courses: [], assignments: [], materials: [], announcements: [] };
  const migrated = migrateWorkspace(legacy);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.schoolCalendar, null);
  const calendar = parseSchoolCalendar(feed(basic), 'UTC', now);
  const workspace = stateSchema.parse({ ...emptyWorkspace(), schoolCalendar: calendar });
  assert.deepEqual(stateSchema.parse(JSON.parse(JSON.stringify(workspace))), workspace);
  assert.equal(schoolCalendarSchema.safeParse({ ...calendar, url: 'https://school.example/private-token' }).success, false);
  assert.throws(() => stateSchema.parse({ ...legacy, version: 4 }));
});

test('feed URL policy blocks credentials, insecure schemes, alternate ports, and all private/reserved address families', async () => {
  assert.equal(normalizeCalendarUrl('webcal://school.example/calendar.ics').protocol, 'https:');
  for (const url of ['file:///etc/passwd', 'http://school.example/a.ics', 'https://u:p@school.example/a.ics', 'https://school.example:444/a.ics']) assert.throws(() => normalizeCalendarUrl(url));
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  await assert.rejects(resolveCalendarAddress(new URL('https://127.0.0.1/a')));
  const mixed = (async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]) as unknown as Parameters<typeof resolveCalendarAddress>[1];
  await assert.rejects(resolveCalendarAddress(new URL('https://school.example/a'), mixed));
});

test('calendar endpoint requires same-origin requests and does not echo private feed URLs in errors', async () => {
  const url = 'http://localhost/api/calendar/sync';
  const privateLink = 'https://127.0.0.1/private-secret-token';
  const request = (origin: string) => new Request(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: privateLink, timeZone: 'UTC' }) });
  assert.equal((await POST(request('https://attacker.example'))).status, 403);
  const response = await POST(request('http://localhost'));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /private-secret-token|127\.0\.0\.1/);
});

test('cancellation records without DTSTART and exception-only feeds are supported', () => {
  const master = event('UID:daily', 'DTSTART;VALUE=DATE:20261025', 'DTEND;VALUE=DATE:20261026', 'RRULE:FREQ=DAILY;COUNT=2', 'SUMMARY:Class');
  const cancellation = event('UID:daily', 'RECURRENCE-ID;VALUE=DATE:20261026', 'STATUS:CANCELLED');
  const calendar = parseSchoolCalendar(feed(master, cancellation), 'UTC', now);
  assert.deepEqual(calendar.events.map(item => item.startDate), ['2026-10-25']);
  const exception = event('UID:other', 'RECURRENCE-ID;VALUE=DATE:20261026', 'DTSTART;VALUE=DATE:20261027', 'DTEND;VALUE=DATE:20261028', 'SUMMARY:Moved event');
  assert.equal(parseSchoolCalendar(feed(exception), 'UTC', now).events.length, 1);
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Calendar } from '../src/components/calendar';
import { CalendarSyncControls } from '../src/components/calendar-sync-controls';
import { monthWithSchoolEvents } from '../src/lib/calendar-model';

test('existing calendar renders imported school events on the correct days', () => {
  const calendar = parseSchoolCalendar(feed(basic), 'UTC', now);
  const html = renderToStaticMarkup(createElement(Calendar, { month: new Date(2026, 9, 1), assignments: [], schoolCalendar: calendar, onSelect: () => {} }));
  assert.equal((html.match(/School · Fall break/g) ?? []).length, 2);
  const controls = renderToStaticMarkup(createElement(CalendarSyncControls, { url: '', onChange: () => {}, onSync: () => {}, syncing: false, label: 'Sync' }));
  assert.match(controls, /School calendar link/);
  assert.equal((controls.match(/<input /g) ?? []).length, 1);
  assert.equal((controls.match(/<button /g) ?? []).length, 1);
});

test('sync opens a month containing imported events instead of an empty month', () => {
  const events = parseSchoolCalendar(feed(basic), 'UTC', now).events;
  const month = monthWithSchoolEvents(events, new Date(2026, 8, 1), '2026-10-24');
  assert.equal(month.getMonth(), 9);
  const selected = new Date(2026, 9, 1);
  assert.equal(monthWithSchoolEvents(events, selected, '2026-10-24'), selected);
});

test('calendar sync accepts the browser Host when Next normalizes request.url to localhost', async () => {
  const response = await POST(new Request('http://localhost:3000/api/calendar/sync', {
    method: 'POST', headers: { Host: '127.0.0.1:3000', Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://127.0.0.1/not-a-public-feed', timeZone: 'UTC' }),
  }));
  assert.equal(response.status, 400); // Passed Origin check; private destination rejected.
});

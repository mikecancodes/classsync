import ICAL from 'ical.js';
import { createHash } from 'node:crypto';
import { CalendarEvent, schoolCalendarSchema } from './calendar-model';

type IcalTime = InstanceType<typeof ICAL.Time>;
type IcalEvent = InstanceType<typeof ICAL.Event>;
const shiftDay = (day: string, offset: number) => new Date(Date.parse(day + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
export function dateInZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function instant(time: IcalTime, hint: string | undefined, viewerZone: string) {
  if (time.zone.tzid !== 'floating' && time.zone.tzid !== 'local') return time.toJSDate();
  const zone = hint || viewerZone;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const desired = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  let result = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(result)).map(part => [part.type, part.value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = desired - observed;
    if (!correction) return new Date(result);
    result += correction;
  }
  throw new Error('The feed contains a local time that does not exist in its time zone.');
}

export function parseSchoolCalendar(text: string, timeZone: string, now = new Date()) {
  if (Buffer.byteLength(text) > 1000000 || !/^\s*BEGIN:VCALENDAR\b/i.test(text.replace(/^\uFEFF/, ''))) {
    throw new Error('The link must return an iCalendar (.ics) feed, not a school login page.');
  }
  // Validate the browser's IANA time zone before parsing or expanding the feed.
  const today = dateInZone(now, timeZone);
  const rangeStart = shiftDay(today, -31), rangeEnd = shiftDay(today, 367);
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== 'vcalendar') throw new Error('Invalid calendar feed.');
  const components = root.getAllSubcomponents('vevent');
  if (components.length > 1000) throw new Error('This feed has too many events (maximum 1,000 source records).');
  const records = new Map<string, IcalEvent>();
  for (const component of components) {
    const event = new ICAL.Event(component, { exceptions: [] });
    if (!event.uid || (!component.hasProperty('dtstart') && component.getFirstPropertyValue('status') !== 'CANCELLED')) throw new Error('Calendar events need an ID and start date.');
    const key = event.uid + '|' + (event.isRecurrenceException() ? event.recurrenceId.toString() : '');
    const previous = records.get(key);
    const sequence = Number(component.getFirstPropertyValue('sequence') ?? 0);
    if (!previous || sequence >= Number(previous.component.getFirstPropertyValue('sequence') ?? 0)) records.set(key, event);
  }
  const events = new Map<string, CalendarEvent>();
  let iterations = 0;
  const emit = (event: IcalEvent, start: IcalTime, end: IcalTime, identity: string) => {
    if (event.component.getFirstPropertyValue('status') === 'CANCELLED') return;
    const startHint = event.component.getFirstProperty('dtstart')?.getParameter('tzid') as string | undefined;
    const endHint = (event.component.getFirstProperty('dtend')?.getParameter('tzid') as string | undefined) || startHint;
    const startInstant = start.isDate ? null : instant(start, startHint, timeZone);
    const endInstant = end.isDate ? null : instant(end, endHint, timeZone);
    const startDate = start.isDate ? start.toString().slice(0, 10) : dateInZone(startInstant!, timeZone);
    if (start.isDate && end.toString().slice(0, 10) < startDate) throw new Error('Calendar event ends before it starts.');
    const endDate = start.isDate
      ? (end.toString().slice(0, 10) > startDate ? end.toString().slice(0, 10) : shiftDay(startDate, 1))
      : shiftDay(dateInZone(new Date(Math.max(startInstant!.getTime(), endInstant!.getTime() - 1)), timeZone), 1);
    if (startDate >= rangeEnd || endDate <= rangeStart) return;
    if (startInstant && endInstant && endInstant < startInstant) throw new Error('Calendar event ends before it starts.');
    const id = createHash('sha256').update(event.uid + '|' + identity).digest('hex');
    events.set(id, {
      id, title: (event.summary || 'School event').slice(0, 160), startDate, endDate,
      startAt: startInstant?.toISOString() ?? null, endAt: endInstant?.toISOString() ?? null,
      allDay: start.isDate, location: (event.location || '').slice(0, 300), description: (event.description || '').slice(0, 2000),
    });
    if (events.size > 500) throw new Error('This feed has more than 500 events in the next year. Choose a smaller school calendar feed.');
  };
  for (const event of records.values()) {
    if (event.component.getFirstPropertyValue('status') === 'CANCELLED') continue;
    if (event.isRecurrenceException()) {
      if (!records.has(event.uid + '|')) emit(event, event.startDate, event.endDate, event.recurrenceId.toString());
      continue;
    }
    const exceptions = [...records.values()].filter(item => item.uid === event.uid && item.isRecurrenceException());
    for (const exception of exceptions) {
      if (exception.modifiesFuture()) throw new Error('This calendar uses an unsupported recurring-event range change.');
      event.relateException(exception);
    }
    if (!event.isRecurring()) { emit(event, event.startDate, event.endDate, 'single'); continue; }
    for (const rule of event.component.getAllProperties('rrule')) {
      const recur = rule.getFirstValue() as InstanceType<typeof ICAL.Recur>;
      if (['SECONDLY', 'MINUTELY', 'HOURLY'].includes(recur.freq)) throw new Error('Calendar recurrences more frequent than daily are not supported.');
    }
    const iterator = event.iterator();
    let occurrence: IcalTime | null;
    while ((occurrence = iterator.next())) {
      if (++iterations > 20000) throw new Error('Calendar recurrence expansion exceeded the supported limit.');
      if (occurrence.toString().slice(0, 10) > shiftDay(rangeEnd, 2)) break;
      if (exceptions.some(exception => exception.component.getFirstPropertyValue('status') === 'CANCELLED' && exception.recurrenceId.compare(occurrence!) === 0)) continue;
      const details = event.getOccurrenceDetails(occurrence);
      emit(details.item, details.startDate, details.endDate, occurrence.toString());
    }
    // A moved exception can enter our window even when its original date is outside it.
    for (const exception of exceptions) if (exception.component.getFirstPropertyValue('status') !== 'CANCELLED') emit(exception, exception.startDate, exception.endDate, exception.recurrenceId.toString());
  }
  return schoolCalendarSchema.parse({
    events: [...events.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
    syncedAt: now.toISOString(), timeZone, rangeStart, rangeEnd,
  });
}

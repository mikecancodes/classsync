import { z } from 'zod';

export const calendarEventSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(160),
  startDate: z.iso.date(), endDate: z.iso.date(),
  startAt: z.iso.datetime().nullable(), endAt: z.iso.datetime().nullable(),
  allDay: z.boolean(), location: z.string().max(300), description: z.string().max(2000),
}).strict().refine(event => event.endDate > event.startDate);
export const schoolCalendarSchema = z.object({
  events: z.array(calendarEventSchema).max(500),
  syncedAt: z.iso.datetime(), timeZone: z.string().min(1).max(100),
  rangeStart: z.iso.date(), rangeEnd: z.iso.date(),
}).strict().refine(calendar => new Set(calendar.events.map(event => event.id)).size === calendar.events.length);
export type SchoolCalendar = z.infer<typeof schoolCalendarSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export const CALENDAR_URL_KEY = 'classsync-school-calendar-url-v1';

export function eventsOnDate(events: CalendarEvent[], date: string) {
  return events.filter(event => event.startDate <= date && date < event.endDate);
}

export function monthWithSchoolEvents(events: CalendarEvent[], selectedMonth: Date, today: string) {
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  const start = key(selectedMonth), end = key(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));
  if (events.some(event => event.startDate < end && event.endDate > start)) return selectedMonth;
  const first = events.find(event => event.endDate > today) ?? events[0];
  if (!first) return selectedMonth;
  const [year, month] = first.startDate.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

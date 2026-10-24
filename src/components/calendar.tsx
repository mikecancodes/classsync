'use client';
import { AcademicState, Assignment, dateKey } from '@/lib/model';
import { eventsOnDate } from '@/lib/calendar-model';

type Props = {
  month: Date; assignments: Assignment[]; onSelect: (assignment?: Assignment) => void;
  schoolCalendar: AcademicState['schoolCalendar']; small?: boolean;
};
export function Calendar({ month, assignments, onSelect, schoolCalendar, small = false }: Props) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return <div className={`calendar-grid ${small ? 'mini' : ''}`}>
    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <div className="weekday" key={index}>{small ? day : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index]}</div>)}
    {Array.from({ length: Math.ceil((start + days) / 7) * 7 }, (_, index) => {
      const date = new Date(month.getFullYear(), month.getMonth(), index - start + 1);
      const key = dateKey(date), inMonth = date.getMonth() === month.getMonth();
      const work = assignments.filter(assignment => assignment.due === key);
      const events = eventsOnDate(schoolCalendar?.events ?? [], key);
      return <div key={key} className={`calendar-day ${inMonth ? '' : 'outside'} ${key === dateKey() ? 'today' : ''}`}>
        <button aria-label={`View ${key}`} onClick={() => onSelect(work[0])}><span>{date.getDate()}</span>{small && work.length + events.length > 0 && <i />}</button>
        {!small && work.map(assignment => <button className={`calendar-event ${assignment.status === 'done' ? 'completed' : ''}`} key={assignment.id} onClick={() => onSelect(assignment)}>{assignment.status === 'done' ? '✓ ' : ''}{assignment.title}</button>)}
        {!small && events.map(event => {
          const time = event.allDay ? 'All day' : new Date(event.startAt!).toLocaleString(undefined, { timeZone: schoolCalendar!.timeZone, dateStyle: 'medium', timeStyle: 'short' });
          const details = [event.title, time, event.location, event.description].filter(Boolean).join('\n\n');
          return <button className="calendar-event school-calendar-event" key={'school-' + event.id} title={details} onClick={() => window.alert(details)}>School · {event.title}</button>;
        })}
      </div>;
    })}
  </div>;
}

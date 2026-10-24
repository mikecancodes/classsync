import { AcademicState, Assignment, dateKey, formatDate } from './model';

export function shiftDate(today: string, days: number): string {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function dueSoon(assignments: Assignment[], today = dateKey()) {
  const end = shiftDate(today, 7);
  return assignments.filter(a => a.status !== 'done' && a.due >= today && a.due <= end);
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function answerAcademicQuestion(question: string, data: AcademicState, today = dateKey()): string {
  const text = normalize(question);
  let pending = data.assignments.filter(a => a.status !== 'done').sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
  const matches = data.courses.filter(c => text.includes(normalize(c.name)) || text.includes(normalize(c.code)));
  if (matches.length > 1) return `Which course did you mean? ${matches.map(c => c.name).join(', ')}.`;
  if (matches.length === 1) pending = pending.filter(a => a.courseId === matches[0].id);
  const list = (rows: Assignment[]) => rows.map(a => {
    const course = data.courses.find(c => c.id === a.courseId)!;
    return `• ${a.title}\n  ${course.name} · ${formatDate(a.due)}${a.due < today ? ' · Overdue' : ''}`;
  }).join('\n\n');
  const result = (heading: string, rows: Assignment[]) => `${heading}\n\n${rows.length ? list(rows) : 'No incomplete assignments match. You’re clear for this view.'}`;

  if (/tomorrow/.test(text)) return result(`Due tomorrow (${formatDate(shiftDate(today, 1))})`, pending.filter(a => a.due === shiftDate(today, 1)));
  if (/missing|overdue|late/.test(text)) return result('Overdue and incomplete — this is what “missing” means here, not an instructor’s official record.', pending.filter(a => a.due < today));
  if (/plan|schedule|organize/.test(text)) {
    if (!pending.length) return 'You have no incomplete assignments. Set aside a little time to review your course notes.';
    return 'Suggested study order\n\n' + list(pending.slice(0, 6)) + '\n\nStart with overdue work, then the nearest deadline. Use a 25-minute focus block and a 5-minute break; repeat as needed. This is a deadline-based suggestion, not a capacity-aware weekly plan. Assignment duration and priority planning are still to come. No deadlines or coursework have been changed.';
  }
  if (/work on today|should i.*today/.test(text)) return result('Start here today — overdue work first, then the nearest deadline.', pending.slice(0, 3));
  if (/today/.test(text)) return result(`Due today (${formatDate(today)})`, pending.filter(a => a.due === today));
  if (/week|due soon|next 7|next seven/.test(text)) return result(`Due soon: ${formatDate(today)}–${formatDate(shiftDate(today, 7))} (today through the next seven days).`, dueSoon(pending, today));
  if (matches.length) return result(`Incomplete work for ${matches[0].name}`, pending);
  if (/\bfor\b/.test(text)) return `I couldn’t identify that course. Try an exact course name or code: ${data.courses.map(c => `${c.name} (${c.code})`).join(', ')}.`;
  if (/assignment|deadline|coursework/.test(text)) return result('Your incomplete assignments, nearest deadline first', pending);
  return 'I can check your current assignments, tomorrow’s deadlines, overdue work, and a suggested study order. Try “What should I work on today?” or include an exact course name. Local answers use rules, not a live AI model.';
}

import { AcademicState } from '@/lib/model';
import { dueSoon } from '@/lib/academic-assistant';

export function DashboardSummary({ data, today }: { data: AcademicState; today: string }) {
  const stats = [
    { title: 'Due soon', value: dueSoon(data.assignments, today).length, detail: 'Today + next 7 days' },
    { title: 'Completed', value: data.assignments.filter(item => item.status === 'done').length, detail: 'Assignments finished' },
    { title: 'Total assignments', value: data.assignments.length, detail: 'Across ' + data.courses.length + ' courses' },
  ];
  return <dl className="focus-summary" aria-label="Assignment summary">{stats.map(stat => (
    <div key={stat.title}><dt>{stat.title}</dt><dd>{stat.value}</dd><span>{stat.detail}</span></div>
  ))}</dl>;
}

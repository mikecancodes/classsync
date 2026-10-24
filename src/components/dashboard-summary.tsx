import { CheckCircle2, Clock3, ListTodo } from 'lucide-react';
import { AcademicState } from '@/lib/model';
import { dueSoon } from '@/lib/academic-assistant';

export function DashboardSummary({ data, today }: { data: AcademicState; today: string }) {
  const stats = [
    { title: 'Total Assignments', value: data.assignments.length, detail: `${data.courses.length} courses, one place`, icon: ListTodo, color: 'blue' },
    { title: 'Due Soon', value: dueSoon(data.assignments, today).length, detail: 'Today + next 7 days', icon: Clock3, color: 'orange' },
    { title: 'Completed Assignments', value: data.assignments.filter(a => a.status === 'done').length, detail: 'Every step counts', icon: CheckCircle2, color: 'green' },
  ];
  return <div className="stat-grid" aria-label="Assignment summary">{stats.map(stat => (
    <div className="stat-card" key={stat.title}>
      <span className={`stat-icon ${stat.color}`}><stat.icon size={20} /></span>
      <div><span>{stat.title}</span><strong>{stat.value}<small>{stat.detail}</small></strong></div>
    </div>
  ))}</div>;
}

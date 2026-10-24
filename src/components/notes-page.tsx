'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { AcademicState } from '@/lib/model';
import { Materials } from './panels';

export function NotesPage({ data, setData, notify }: { data: AcademicState; setData: Dispatch<SetStateAction<AcademicState>>; notify: (message: string) => void }) {
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? '');
  const course = data.courses.find(item => item.id === courseId) ?? data.courses[0];
  if (!course) return <div className="empty"><span className="empty-state-icon"><BookOpen size={26} aria-hidden="true" /></span><h2>A home for your notes</h2><p>Add a class to keep its lecture notes and materials together.</p><Button variant="outline" asChild><Link href="/courses">Go to my classes</Link></Button></div>;
  return <div className="notes-workspace"><label className="board-course-select">Class<select value={course.id} onChange={event => setCourseId(event.target.value)}>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Materials key={course.id} course={course} data={data} setData={setData} notify={notify} /></div>;
}

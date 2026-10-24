'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { AcademicState } from '@/lib/model';
import { Materials } from './panels';

export function NotesPage({ data, setData, notify }: { data: AcademicState; setData: Dispatch<SetStateAction<AcademicState>>; notify: (message: string) => void }) {
  const [courseId, setCourseId] = useState(data.courses[0].id);
  const course = data.courses.find(item => item.id === courseId) ?? data.courses[0];
  return <div className="notes-workspace"><label className="board-course-select">Class<select value={course.id} onChange={event => setCourseId(event.target.value)}>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Materials key={course.id} course={course} data={data} setData={setData} notify={notify} /></div>;
}

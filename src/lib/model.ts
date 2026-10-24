import { z } from 'zod';
export const categorySchema = z.object({ name: z.string().min(1).max(80), weight: z.number().min(0).max(100) });
export const courseSchema = z.object({ id: z.string().min(1).max(100), code: z.string().min(1).max(30), name: z.string().min(1).max(100), professor: z.string().max(100), schedule: z.string().max(120), color: z.enum(['blue','purple','green','orange']), categories: z.array(categorySchema).min(1).max(20), syllabus: z.string().max(40000) });
export const assignmentSchema = z.object({ id: z.string().min(1).max(100), courseId: z.string().min(1).max(100), title: z.string().trim().min(1).max(160), due: z.iso.date(), status: z.enum(['todo','progress','done']), category: z.string().min(1).max(80), points: z.number().positive().max(100000), earned: z.number().min(0).max(100000).nullable(), description: z.string().max(5000) }).refine(a => a.earned === null || a.earned <= a.points, { message: 'Earned points cannot exceed possible points.' });
export const materialSchema = z.object({ id: z.string().min(1), courseId: z.string().min(1), title: z.string().min(1).max(160), text: z.string().max(40000), kind: z.enum(['notes','material']) });
export const announcementSchema = z.object({
  id: z.string().min(1).max(100), courseId: z.string().min(1).max(100),
  platform: z.enum(['D2L', 'Canvas']), title: z.string().min(1).max(160),
  description: z.string().max(2000), priority: z.enum(['high', 'medium', 'low']).optional(), posted: z.iso.date(), read: z.boolean(),
});
export const stateSchema = z.object({ version: z.union([z.literal(1), z.literal(2)]).default(2).transform(() => 2 as const), announcements: z.array(announcementSchema).max(300).default([]), courses: z.array(courseSchema).min(1).max(50), assignments: z.array(assignmentSchema).max(1000), materials: z.array(materialSchema).max(200) }).strict().superRefine((s, ctx) => {
  if (new Set(s.courses.map(c=>c.id)).size !== s.courses.length || new Set(s.assignments.map(a=>a.id)).size !== s.assignments.length || new Set(s.materials.map(m=>m.id)).size !== s.materials.length) ctx.addIssue({code:'custom',message:'IDs must be unique.'});
  for (const a of s.assignments) if (!s.courses.some(c=>c.id===a.courseId && c.categories.some(cat=>cat.name===a.category))) ctx.addIssue({code:'custom',message:'Assignment course or category does not exist.'});
  for (const m of s.materials) if (!s.courses.some(c=>c.id===m.courseId)) ctx.addIssue({code:'custom',message:'Material course does not exist.'});
  if (new Set(s.announcements.map(a => a.id)).size !== s.announcements.length) ctx.addIssue({ code: 'custom', message: 'Announcement IDs must be unique.' });
  for (const a of s.announcements) if (!s.courses.some(c => c.id === a.courseId)) ctx.addIssue({ code: 'custom', message: 'Announcement course does not exist.' });
});
export type Course = z.infer<typeof courseSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Material = z.infer<typeof materialSchema>;
export type AcademicState = z.infer<typeof stateSchema>;
export function dateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function offsetDate(days: number) { const d = new Date(); d.setDate(d.getDate()+days); return dateKey(d); }
export function formatDate(date: string) { return new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
export function grade(course: Course, assignments: Assignment[]) {
  let weighted = 0, gradedWeight = 0;
  for (const category of course.categories) {
    const rows = assignments.filter(a=>a.courseId===course.id && a.category===category.name && a.earned!==null);
    const possible = rows.reduce((s,a)=>s+a.points,0);
    if (possible && category.weight > 0) { weighted += rows.reduce((s,a)=>s+a.earned!,0)/possible * category.weight; gradedWeight += category.weight; }
  }
  return { current: gradedWeight ? weighted/gradedWeight*100 : null, gradedWeight, weighted };
}
export function letter(value: number | null) { return value===null ? '—' : value>=90?'A':value>=80?'B':value>=70?'C':value>=60?'D':'F'; }
export function extractWeights(text: string) { return [...text.matchAll(/^\s*([A-Za-z][A-Za-z &/-]{1,60})\s*[:–-]?\s+(\d+(?:\.\d+)?)\s*%/gm)].map(m=>({name:m[1].replace(/[\s:–-]+$/,'').trim(),weight:Number(m[2])})); }

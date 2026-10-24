import { AcademicState, Course, stateSchema } from './model';
import type { SyllabusWeight } from './syllabus';

// Applies a syllabus's grading breakdown to a class: the weights become its categories and
// each assignment moves to the category it belongs in (Midterm → Exams, Lab 3 → Labs).
// Assignments that fit nowhere keep their old category at 0% so nothing becomes invalid.

type Category = Course['categories'][number];
export type WeightMove = { id: string; title: string; from: string; to: string };
export type WeightPlan = { categories: Category[]; moves: WeightMove[]; kept: string[]; total: number };

const KINDS: [string, RegExp][] = [
  ['exam', /\b(exams?|midterms?|finals?|tests?)\b/i],
  ['quiz', /\bquiz(zes)?\b/i],
  ['lab', /\blabs?\b|\blaborator/i],
  ['homework', /\b(homeworks?|hw|assignments?|problem sets?|psets?|worksheets?)\b/i],
  ['project', /\b(projects?|papers?|essays?|reports?|presentations?|portfolios?)\b/i],
  ['discussion', /\b(discussions?|forums?|posts?)\b/i],
  ['participation', /\b(participation|attendance|engagement|in-class|clickers?)\b/i],
  ['reading', /\b(readings?|reading responses?|reflections?|journals?)\b/i],
];
const kindsOf = (text: string) => KINDS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
const stem = (word: string) => word.toLowerCase().replace(/(es|s)$/, '');
const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2).map(stem));

// The weight category an assignment title belongs to, or null if none fits
export function matchCategory(title: string, weights: SyllabusWeight[]): string | null {
  const titleKinds = kindsOf(title);
  const titleWords = words(title);
  let best: { name: string; score: number } | null = null;
  for (const weight of weights) {
    const shared = kindsOf(weight.name).filter(kind => titleKinds.includes(kind)).length;
    const overlap = [...words(weight.name)].filter(w => titleWords.has(w)).length;
    const score = shared * 2 + overlap;
    if (score > 0 && (!best || score > best.score)) best = { name: weight.name, score };
  }
  return best?.name ?? null;
}

export function planWeights(state: AcademicState, courseId: string, weights: SyllabusWeight[]): WeightPlan {
  const categories: Category[] = weights.slice(0, 20).map(w => ({ name: w.name, weight: w.weight }));
  const names = new Set(categories.map(c => c.name));
  const moves: WeightMove[] = [];
  const kept = new Set<string>();
  for (const a of state.assignments.filter(a => a.courseId === courseId)) {
    if (names.has(a.category)) continue;
    const to = matchCategory(a.title, weights) ?? matchCategory(a.category, weights);
    if (to) moves.push({ id: a.id, title: a.title, from: a.category, to });
    else kept.add(a.category);
  }
  for (const name of kept) if (categories.length < 20) categories.push({ name, weight: 0 });
  return { categories, moves, kept: [...kept], total: weights.reduce((sum, w) => sum + w.weight, 0) };
}

// Returns the updated workspace; throws (changing nothing) if the result would be invalid
export function applyWeightPlan(state: AcademicState, courseId: string, plan: WeightPlan): AcademicState {
  const to = new Map(plan.moves.map(m => [m.id, m.to]));
  return stateSchema.parse({
    ...state,
    courses: state.courses.map(c => c.id === courseId ? { ...c, categories: plan.categories } : c),
    assignments: state.assignments.map(a => to.has(a.id) ? { ...a, category: to.get(a.id)! } : a),
  });
}

// A class still on a single catch-all bucket hasn't been given real weights yet
export const needsWeights = (course: Course) => course.categories.length === 1 && course.categories[0].weight === 100;

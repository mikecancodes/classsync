import { Assignment, Course, grade } from './model';

// Per-category numbers and projections for the grade calculator. "Current grade" uses the
// same rule as grade() in model.ts: graded work only, blank scores excluded, zeros counted.

export type CategoryRow = {
  name: string;
  weight: number;
  earned: number;
  possible: number;
  average: number | null;       // percent over graded items
  contribution: number | null;  // percentage points this category adds to the current grade
  graded: number;
  ungraded: number;
  ungradedPoints: number;
};

export const weightTotal = (course: Course) => course.categories.reduce((sum, c) => sum + c.weight, 0);
export const weightsValid = (course: Course) => Math.abs(weightTotal(course) - 100) < 0.001;

export function categoryBreakdown(course: Course, assignments: Assignment[]): CategoryRow[] {
  const { gradedWeight } = grade(course, assignments);
  return course.categories.map(category => {
    const rows = assignments.filter(a => a.courseId === course.id && a.category === category.name);
    const graded = rows.filter(a => a.earned !== null);
    const earned = graded.reduce((sum, a) => sum + a.earned!, 0);
    const possible = graded.reduce((sum, a) => sum + a.points, 0);
    const average = possible ? (earned / possible) * 100 : null;
    const ungradedRows = rows.filter(a => a.earned === null);
    return {
      name: category.name,
      weight: category.weight,
      earned,
      possible,
      average,
      contribution: average !== null && category.weight > 0 && gradedWeight ? (average * category.weight) / gradedWeight : null,
      graded: graded.length,
      ungraded: ungradedRows.length,
      ungradedPoints: ungradedRows.reduce((sum, a) => sum + a.points, 0),
    };
  });
}

// Final grade if every ungraded item scored `percent`, and empty categories averaged it too
export function projectedGrade(course: Course, assignments: Assignment[], percent: number) {
  let total = 0, weights = 0;
  for (const row of categoryBreakdown(course, assignments)) {
    if (row.weight <= 0) continue;
    const pointsLeft = row.ungradedPoints;
    const average = row.possible + pointsLeft > 0
      ? ((row.earned + (pointsLeft * percent) / 100) / (row.possible + pointsLeft)) * 100
      : percent;
    total += average * row.weight;
    weights += row.weight;
  }
  return weights ? total / weights : null;
}

export type Requirement =
  | { status: 'reachable'; needed: number }
  | { status: 'secured' }        // even zeros on the rest keep the target
  | { status: 'unreachable'; best: number }
  | { status: 'nothing-left' };  // no ungraded work or empty categories remain

// Average needed on all remaining work to finish at `target` percent. The projection is
// linear in that average, so two points pin it down.
export function requiredAverage(course: Course, assignments: Assignment[], target: number): Requirement {
  const atZero = projectedGrade(course, assignments, 0);
  const atFull = projectedGrade(course, assignments, 100);
  if (atZero === null || atFull === null || Math.abs(atFull - atZero) < 1e-9) return { status: 'nothing-left' };
  if (atZero >= target) return { status: 'secured' };
  if (atFull < target) return { status: 'unreachable', best: atFull };
  return { status: 'reachable', needed: ((target - atZero) / (atFull - atZero)) * 100 };
}

// Turns raw D2L data (from collectD2L) into the payload ClassSync's
// POST /api/imports/preview accepts. Limits mirror src/lib/model.ts; keep them in sync.
// Pure function, no browser APIs, so it can be tested in Node.

const COLORS = ['blue', 'purple', 'green', 'orange'];
const CATEGORY = 'Coursework';
const PLACEHOLDER_POINTS = 100;
const LIMITS = { courses: 50, assignments: 1000, announcements: 300 };

const clip = (text, max) => (text ?? '').toString().slice(0, max);
const normalize = title => (title ?? '').trim().toLowerCase();

// D2L sends UTC timestamps; the app stores local calendar dates (YYYY-MM-DD).
// "Due Oct 25 03:59 UTC" is Oct 24 at 11:59pm in US Eastern, so convert in local time.
export function localDateKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const absoluteUrl = (origin, url) => (url && url.startsWith('/') ? origin + url : url);

// Gradebook items that hold a student's score (numeric, pass/fail, select box); skips text
// comments, calculated/formula items, final grades and category totals
const SCORED_GRADE_TYPES = new Set([1, 2, 3]);

// D2L grade categories → ClassSync categories with weights, plus which category each grade
// item belongs to. Weighted gradebooks use Weight; points gradebooks use each category's
// share of MaxPoints. Students can be refused access, in which case this returns null.
export function mapCategories(categories) {
  const usable = (categories ?? []).filter(c => c && c.Name?.trim());
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, c) => sum + (Number(c.Weight) || 0), 0);
  const totalPoints = usable.reduce((sum, c) => sum + (Number(c.MaxPoints) || 0), 0);
  const names = new Set([CATEGORY]);
  const list = [];
  const byGradeObject = new Map();
  for (const category of usable.slice(0, 19)) {
    let name = clip(category.Name.trim(), 80);
    for (let n = 2; names.has(name); n++) name = clip(`${category.Name.trim()} (${n})`, 80);
    names.add(name);
    const raw = totalWeight > 0 ? Number(category.Weight) || 0 : totalPoints > 0 ? ((Number(category.MaxPoints) || 0) / totalPoints) * 100 : 100 / usable.length;
    list.push({ name, weight: Math.min(100, Math.round(raw * 100) / 100) });
    for (const item of category.Grades ?? []) if (item?.Id != null) byGradeObject.set(String(item.Id), name);
  }
  // Items outside every category still need a home; weight 0 keeps D2L's weights intact
  list.push({ name: CATEGORY, weight: 0 });
  return { list, byGradeObject };
}

export function toImportPayload(raw) {
  const warnings = [];
  const courses = [];
  const assignments = new Map();
  const announcements = [];
  const syllabi = [];
  const gradesByCourse = new Map();

  for (const [index, entry] of raw.courses.slice(0, LIMITS.courses).entries()) {
    const ou = entry.enrollment.OrgUnit;
    const courseId = `d2l-${ou.Id}`;
    const name = clip(ou.Name?.trim() || `Course ${ou.Id}`, 100);
    const mapped = mapCategories(entry.categories);
    const categoryOf = gradeObjectId => (gradeObjectId != null && mapped?.byGradeObject.get(String(gradeObjectId))) || CATEGORY;
    courses.push({
      id: courseId,
      code: clip(ou.Code?.trim() || name, 30),
      name,
      professor: '',
      schedule: '',
      color: COLORS[index % COLORS.length],
      categories: mapped ? mapped.list : [{ name: CATEGORY, weight: 100 }],
      syllabus: '',
    });
    if (entry.syllabus?.base64) syllabi.push({ courseId, title: entry.syllabus.title, fileName: entry.syllabus.fileName, mimeType: entry.syllabus.mimeType, base64: entry.syllabus.base64 });

    const scored = entry.grades.filter(g => SCORED_GRADE_TYPES.has(Number(g.GradeObjectType)) && g.PointsDenominator > 0);
    const gradeById = new Map(scored.map(g => [String(g.GradeObjectIdentifier), g]));
    gradesByCourse.set(courseId, { scored, categoryOf, used: new Set(), courseName: name, ou: ou.Id });

    for (const folder of entry.folders) {
      const due = localDateKey(folder.DueDate ?? folder.Availability?.EndDate);
      if (!due) { warnings.push(`Skipped "${folder.Name}" (${name}): no due date in D2L.`); continue; }

      const grade = folder.GradeItemId != null ? gradeById.get(String(folder.GradeItemId)) : undefined;
      if (grade) gradesByCourse.get(courseId).used.add(String(grade.GradeObjectIdentifier));
      const denominator = folder.Assessment?.ScoreDenominator || grade?.PointsDenominator;
      const points = denominator > 0 ? denominator : PLACEHOLDER_POINTS;
      const feedbackScore = folder.MySubmissions.find(s => s.Feedback?.Score != null)?.Feedback.Score;
      let earned = feedbackScore ?? grade?.PointsNumerator ?? null;
      if (earned != null && (earned < 0 || earned > points)) {
        warnings.push(`Score for "${folder.Name}" (${name}) is outside 0-${points}; left blank.`);
        earned = null;
      }
      const submitted = folder.MySubmissions.some(s => (s.Submissions ?? []).length > 0);

      assignments.set(`d2l-dropbox-${ou.Id}-${folder.Id}`, {
        id: `d2l-dropbox-${ou.Id}-${folder.Id}`,
        courseId,
        title: clip(folder.Name?.trim() || 'Untitled assignment', 160),
        due,
        status: earned != null || submitted ? 'done' : 'todo',
        category: categoryOf(folder.GradeItemId),
        points,
        earned,
        description: [
          folder.CustomInstructions?.Text?.trim(),
          denominator > 0 ? '' : `Points not set in D2L; ${PLACEHOLDER_POINTS} used as a placeholder.`,
        ].filter(Boolean).join('\n\n'),
      });
    }

    for (const item of entry.news) {
      if (item.IsHidden) continue;
      announcements.push({ courseId, courseName: name, ou: ou.Id, item });
    }
  }

  // Quizzes, discussions and other dated items. Assignments already added from the
  // dropbox are matched by course + title and only get their D2L link.
  const courseIds = new Set(courses.map(c => c.id));
  const completedIds = new Set();
  for (const item of [...raw.overdueItems, ...raw.dueItems]) {
    const courseId = `d2l-${item.OrgUnitId}`;
    if (!courseIds.has(courseId)) continue;
    const url = absoluteUrl(raw.origin, item.ItemUrl);
    const existing = [...assignments.values()].find(a => a.courseId === courseId && normalize(a.title) === normalize(item.ItemName));
    if (existing) {
      if (url && !existing.description.includes(url)) existing.description = [existing.description, `Open in D2L: ${url}`].filter(Boolean).join('\n\n');
      continue;
    }
    const id = `d2l-item-${item.OrgUnitId}-${item.ItemId}`;
    if (assignments.has(id) || completedIds.has(id)) continue;
    const due = localDateKey(item.DueDate ?? item.EndDate);
    if (!due) continue;
    if (item.IsExempt) { completedIds.add(id); continue; }
    // Quizzes and discussions get their score from the gradebook item with the same name
    const grades = gradesByCourse.get(courseId);
    const grade = grades.scored.find(g => !grades.used.has(String(g.GradeObjectIdentifier)) && normalize(g.GradeObjectName) === normalize(item.ItemName));
    if (grade) grades.used.add(String(grade.GradeObjectIdentifier));
    const points = grade ? grade.PointsDenominator : PLACEHOLDER_POINTS;
    const earned = grade && grade.PointsNumerator != null && grade.PointsNumerator >= 0 && grade.PointsNumerator <= points ? grade.PointsNumerator : null;
    assignments.set(id, {
      id,
      courseId,
      title: clip(item.ItemName?.trim() || 'Untitled item', 160),
      due,
      status: item.DateCompleted || earned != null ? 'done' : 'todo',
      category: grade ? grades.categoryOf(grade.GradeObjectIdentifier) : CATEGORY,
      points,
      earned,
      description: [url && `Open in D2L: ${url}`, grade ? '' : `Points not available from D2L; ${PLACEHOLDER_POINTS} used as a placeholder.`].filter(Boolean).join('\n\n'),
    });
  }

  // Graded items with no matching assignment (exams, participation, in-class work)
  const today = localDateKey(new Date().toISOString());
  for (const [courseId, grades] of gradesByCourse) {
    for (const grade of grades.scored) {
      const gradeId = String(grade.GradeObjectIdentifier);
      if (grades.used.has(gradeId) || grade.PointsNumerator == null) continue;
      const existing = [...assignments.values()].find(a => a.courseId === courseId && normalize(a.title) === normalize(grade.GradeObjectName));
      if (existing) {
        if (existing.earned == null && grade.PointsNumerator <= grade.PointsDenominator) Object.assign(existing, { points: grade.PointsDenominator, earned: grade.PointsNumerator, status: 'done', category: grades.categoryOf(gradeId) });
        continue;
      }
      if (grade.PointsNumerator < 0 || grade.PointsNumerator > grade.PointsDenominator) {
        warnings.push(`Score for "${grade.GradeObjectName}" (${grades.courseName}) is outside 0-${grade.PointsDenominator}; left out.`);
        continue;
      }
      const id = `d2l-grade-${grades.ou}-${gradeId}`;
      assignments.set(id, {
        id,
        courseId,
        title: clip(grade.GradeObjectName?.trim() || 'Graded item', 160),
        due: localDateKey(grade.ReleasedDate ?? grade.LastModified) ?? today,
        status: 'done',
        category: grades.categoryOf(gradeId),
        points: grade.PointsDenominator,
        earned: grade.PointsNumerator,
        description: grade.Comments?.Text?.trim() ? `Instructor comment: ${grade.Comments.Text.trim()}` : 'Graded item from the D2L gradebook.',
      });
    }
  }

  let assignmentList = [...assignments.values()].map(a => ({ ...a, description: clip(a.description, 5000) }));
  if (assignmentList.length > LIMITS.assignments) {
    // keep the ones closest to today
    const today = localDateKey(new Date().toISOString());
    const distance = a => Math.abs(new Date(a.due) - new Date(today));
    assignmentList = assignmentList.sort((a, b) => distance(a) - distance(b)).slice(0, LIMITS.assignments);
    warnings.push(`Only the ${LIMITS.assignments} assignments closest to today were included.`);
  }
  assignmentList.sort((a, b) => a.due.localeCompare(b.due));

  const announcementList = announcements
    .map(({ courseId, ou, item }) => ({
      id: `d2l-news-${ou}-${item.Id}`,
      courseId,
      platform: 'D2L',
      title: clip(item.Title?.trim() || 'Untitled announcement', 160),
      description: clip(item.Body?.Text?.trim() ?? '', 2000),
      posted: localDateKey(item.StartDate ?? item.CreatedDate) ?? today,
      read: false,
    }))
    .sort((a, b) => b.posted.localeCompare(a.posted))
    .slice(0, LIMITS.announcements);
  if (announcements.length > LIMITS.announcements) warnings.push(`Only the ${LIMITS.announcements} newest announcements were included.`);

  if (courses.length === 0) warnings.push('No active courses found in D2L.');

  return {
    payload: { version: 1, source: 'd2l', data: { version: 2, courses, assignments: assignmentList, materials: [], announcements: announcementList }, syllabi },
    warnings,
  };
}

// Turns raw D2L data (from collectD2L) into the payload ClassSync's
// POST /api/imports/preview accepts. Limits mirror src/lib/model.ts; keep them in sync.
// Pure function, no browser APIs, so it can be tested in Node.

const COLORS = ['blue', 'purple', 'green', 'orange'];
const CATEGORY = 'Coursework';
const PLACEHOLDER_POINTS = 100;
const LIMITS = { courses: 50, assignments: 1000, materials: 200 };

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

export function toImportPayload(raw) {
  const warnings = [];
  const courses = [];
  const assignments = new Map();
  const announcements = [];

  for (const [index, entry] of raw.courses.slice(0, LIMITS.courses).entries()) {
    const ou = entry.enrollment.OrgUnit;
    const courseId = `d2l-${ou.Id}`;
    const name = clip(ou.Name?.trim() || `Course ${ou.Id}`, 100);
    courses.push({
      id: courseId,
      code: clip(ou.Code?.trim() || name, 30),
      name,
      professor: '',
      schedule: '',
      color: COLORS[index % COLORS.length],
      // D2L's own grade categories and weights aren't imported yet, so one 100% bucket
      categories: [{ name: CATEGORY, weight: 100 }],
      syllabus: '',
    });

    const gradeById = new Map(entry.grades.map(g => [String(g.GradeObjectIdentifier), g]));

    for (const folder of entry.folders) {
      const due = localDateKey(folder.DueDate ?? folder.Availability?.EndDate);
      if (!due) { warnings.push(`Skipped "${folder.Name}" (${name}): no due date in D2L.`); continue; }

      const grade = folder.GradeItemId != null ? gradeById.get(String(folder.GradeItemId)) : undefined;
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
        category: CATEGORY,
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
    assignments.set(id, {
      id,
      courseId,
      title: clip(item.ItemName?.trim() || 'Untitled item', 160),
      due,
      status: item.DateCompleted ? 'done' : 'todo',
      category: CATEGORY,
      points: PLACEHOLDER_POINTS,
      earned: null,
      description: [url && `Open in D2L: ${url}`, `Points not available from D2L; ${PLACEHOLDER_POINTS} used as a placeholder.`].filter(Boolean).join('\n\n'),
    });
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

  // announcements become course materials so the study assistant can read them
  const materials = announcements
    .map(({ courseId, ou, item }) => {
      const posted = item.StartDate ?? item.CreatedDate;
      return {
        id: `d2l-news-${ou}-${item.Id}`,
        courseId,
        title: clip(`Announcement: ${item.Title?.trim() || 'Untitled'}`, 160),
        text: clip([posted && `Posted ${localDateKey(posted)}`, item.Body?.Text?.trim()].filter(Boolean).join('\n\n'), 40000),
        kind: 'material',
        posted: posted ?? '',
      };
    })
    .sort((a, b) => b.posted.localeCompare(a.posted))
    .slice(0, LIMITS.materials)
    .map(({ posted, ...material }) => material);
  if (announcements.length > LIMITS.materials) warnings.push(`Only the ${LIMITS.materials} newest announcements were included.`);

  if (courses.length === 0) warnings.push('No active courses found in D2L.');

  return {
    payload: { version: 1, source: 'd2l', data: { courses, assignments: assignmentList, materials } },
    warnings,
  };
}

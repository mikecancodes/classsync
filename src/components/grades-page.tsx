'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Calculator, FlaskConical, Plus, RotateCcw, Target, Trash2 } from 'lucide-react';
import { AcademicState, Assignment, Course, dateKey, extractWeights, formatDate, grade, letter } from '@/lib/model';

type Category = Course['categories'][number];
import { categoryBreakdown, requiredAverage, weightTotal, weightsValid } from '@/lib/grade-math';

const pct = (value: number | null, digits = 1) => value === null ? '—' : `${value.toFixed(digits)}%`;

// All classes at a glance; each card opens that class's calculator
export function GradesOverview({ data }: { data: AcademicState }) {
  if (!data.courses.length) return <div className="empty"><h2>No classes yet</h2><p>Add a class or sync from D2L to see grades.</p></div>;
  return <div className="grades-overview">{data.courses.map(course => {
    const current = grade(course, data.assignments).current;
    const items = data.assignments.filter(a => a.courseId === course.id);
    const graded = items.filter(a => a.earned !== null).length;
    const total = weightTotal(course);
    return <Link key={course.id} href={`/grades/${course.id}`} className={`panel grade-card ${course.color}`}>
      <div className="grade-card-top"><span className="course-code">{course.code}</span><ArrowUpRight size={16} /></div>
      <h3>{course.name}</h3>
      <div className="grade-card-score"><strong>{pct(current)}</strong><span className="grade-letter">{letter(current)}</span></div>
      <div className="course-progress"><span style={{ width: `${Math.min(100, current ?? 0)}%` }} /></div>
      <p className="muted">{graded} of {items.length} graded · {course.categories.length} categor{course.categories.length === 1 ? 'y' : 'ies'}</p>
      <p className={weightsValid(course) ? 'muted' : 'error'}>{weightsValid(course) ? 'Weights total 100%' : `Weights total ${total.toFixed(1)}%. Open to fix.`}</p>
    </Link>;
  })}</div>;
}

// A category name that commits on blur or Enter, so renaming doesn't fire on every keystroke
function CategoryName({ value, onRename }: { value: string; onRename: (next: string) => string | null }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(value); setError(''); }, [value]);
  const commit = () => { if (draft.trim() === value) return setDraft(value); const problem = onRename(draft.trim()); setError(problem ?? ''); if (problem) setDraft(value); };
  return <span className="category-name">
    <input aria-label={`Rename ${value}`} value={draft} maxLength={80} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    {error && <small className="error">{error}</small>}
  </span>;
}

type Working = { categories: Category[]; assignments: Assignment[] };

// One class's calculator: weights, category averages, editable scores, what-if and target
export function CourseGradebook({ course, data, setData, notify }: { course: Course; data: AcademicState; setData: Dispatch<SetStateAction<AcademicState>>; notify: (message: string) => void }) {
  const [draft, setDraft] = useState<Working | null>(null);
  const [target, setTarget] = useState(90);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState('');
  const [weightText, setWeightText] = useState('');
  const [proposed, setProposed] = useState<Category[] | null>(null);
  const [extractError, setExtractError] = useState('');
  useEffect(() => { setDraft(null); setRowError({}); setProposed(null); setWeightText(course.syllabus); }, [course.id]);

  const whatIf = draft !== null;
  const working: Working = draft ?? { categories: course.categories, assignments: data.assignments };
  const workingCourse: Course = { ...course, categories: working.categories };
  const mine = working.assignments.filter(a => a.courseId === course.id);
  const current = grade(workingCourse, working.assignments).current;
  const savedCurrent = grade(course, data.assignments).current;
  const rows = categoryBreakdown(workingCourse, working.assignments);
  const total = weightTotal(workingCourse);
  const requirement = requiredAverage(workingCourse, working.assignments, target);

  // Edits go to the what-if draft when it's on, otherwise straight into the workspace
  function change(update: (w: Working) => Working) {
    if (whatIf) return setDraft(d => d && update(d));
    setData(d => {
      const next = update({ categories: d.courses.find(c => c.id === course.id)?.categories ?? course.categories, assignments: d.assignments });
      return { ...d, courses: d.courses.map(c => c.id === course.id ? { ...c, categories: next.categories } : c), assignments: next.assignments };
    });
  }
  const setCategories = (fn: (c: Category[]) => Category[]) => change(w => ({ ...w, categories: fn(w.categories) }));
  const patchAssignment = (id: string, patch: Partial<Assignment>) => change(w => ({ ...w, assignments: w.assignments.map(a => a.id === id ? { ...a, ...patch } : a) }));

  function rename(from: string, to: string) {
    if (!to) return 'Name can’t be empty.';
    if (working.categories.some(c => c.name === to)) return 'That name is already used.';
    change(w => ({
      categories: w.categories.map(c => c.name === from ? { ...c, name: to } : c),
      assignments: w.assignments.map(a => a.courseId === course.id && a.category === from ? { ...a, category: to } : a),
    }));
    return null;
  }

  function setScore(a: Assignment, field: 'earned' | 'points', raw: string) {
    const value = raw === '' ? null : Number(raw);
    const earned = field === 'earned' ? value : a.earned;
    const points = field === 'points' ? value : a.points;
    let problem = '';
    if (points === null || !Number.isFinite(points) || points <= 0) problem = 'Points must be above 0.';
    else if (earned !== null && (!Number.isFinite(earned) || earned < 0)) problem = 'Score can’t be negative.';
    else if (earned !== null && earned > points) problem = 'Score can’t be more than the points possible.';
    setRowError(e => ({ ...e, [a.id]: problem }));
    if (!problem) patchAssignment(a.id, { earned, points: points! });
  }

  function addCategory() {
    const name = newCategory.trim().slice(0, 80);
    if (!name || working.categories.some(c => c.name === name) || working.categories.length >= 20) return;
    setCategories(c => [...c, { name, weight: 0 }]);
    setNewCategory('');
  }

  function addHypothetical() {
    const category = working.categories[0]?.name;
    if (!category) return;
    setDraft(d => d && { ...d, assignments: [...d.assignments, { id: `what-if-${crypto.randomUUID()}`, courseId: course.id, title: 'Hypothetical item', due: dateKey(), status: 'todo', category, points: 100, earned: null, description: '' }] });
  }

  function applyExtracted() {
    if (!proposed) return;
    const names = new Set(proposed.map(p => p.name));
    if (names.size !== proposed.length) return setExtractError('Remove duplicate category names.');
    const orphaned = [...new Set(mine.map(a => a.category))].filter(name => !names.has(name));
    // Keep categories that assignments still use, at weight 0, so nothing becomes invalid
    setCategories(() => [...proposed, ...orphaned.map(name => ({ name, weight: 0 }))]);
    setProposed(null); setExtractError('');
    notify(orphaned.length ? `Weights applied. ${orphaned.join(', ')} kept at 0% because assignments use them.` : 'Weights applied');
  }

  return <div className="gradebook">
    <section className="panel form-panel gradebook-summary">
      <div className="gradebook-score">
        <span className="eyebrow">{whatIf ? 'WHAT-IF GRADE' : 'CURRENT GRADE'}</span>
        <strong>{pct(current)}</strong><span className="grade-letter">{letter(current)}</span>
        {whatIf && <small className="muted">Saved grade: {pct(savedCurrent)} ({letter(savedCurrent)})</small>}
      </div>
      <div className="gradebook-actions">
        {whatIf
          ? <><button className="secondary-button" onClick={addHypothetical}><Plus size={15} />Add hypothetical item</button><button className="secondary-button" onClick={() => setDraft({ categories: course.categories, assignments: data.assignments })}><RotateCcw size={15} />Reset</button><button className="primary-button" onClick={() => { setDraft(null); setRowError({}); }}>Exit what-if</button></>
          : <button className="secondary-button" onClick={() => setDraft({ categories: course.categories, assignments: data.assignments })}><FlaskConical size={15} />Try what-if scores</button>}
      </div>
      {whatIf && <p className="notice">What-if mode: nothing you change here is saved.</p>}
      <div className="gradebook-target">
        <label><Target size={15} />Target grade<input type="number" min={0} max={100} step="0.5" value={target} onChange={e => setTarget(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />%</label>
        <p>{requirement.status === 'reachable' ? <>Average <strong>{requirement.needed.toFixed(1)}%</strong> on the remaining work to finish at {target}%.</>
          : requirement.status === 'secured' ? <>You’ll finish at or above {target}% even with zeros on the remaining work.</>
          : requirement.status === 'unreachable' ? <>{target}% isn’t reachable; perfect scores on the rest give {requirement.best.toFixed(1)}%.</>
          : <>No ungraded work is left to change the grade. Add assignments, or try what-if items.</>}</p>
        {!weightsValid(workingCourse) && <p className="error">Weights total {total.toFixed(1)}%, not 100%, so projections are approximate.</p>}
      </div>
    </section>

    <section className="panel form-panel">
      <div className="section-heading"><h2><Calculator size={18} /> Categories</h2><span className={weightsValid(workingCourse) ? 'badge done' : 'badge todo'}>Total {total.toFixed(1)}%</span></div>
      <div className="gradebook-table" role="table" aria-label="Grade categories">
        <div role="row" className="gradebook-head"><span>Category</span><span>Weight</span><span>Average</span><span>Adds</span><span>Items</span><span /></div>
        {rows.map((row, i) => <div role="row" key={row.name}>
          <CategoryName value={row.name} onRename={next => rename(row.name, next)} />
          <label className="weight-input"><input aria-label={`${row.name} weight`} type="number" min={0} max={100} step="0.1" value={row.weight} onChange={e => { const weight = Math.min(100, Math.max(0, Number(e.target.value) || 0)); setCategories(c => c.map((x, j) => j === i ? { ...x, weight } : x)); }} />%</label>
          <span>{pct(row.average)}</span>
          <span>{row.contribution === null ? '—' : `${row.contribution.toFixed(1)} pts`}</span>
          <span className="muted">{row.graded} graded · {row.ungraded} to go</span>
          <button className="icon-button" aria-label={`Remove ${row.name}`} disabled={row.graded + row.ungraded > 0 || working.categories.length <= 1} title={row.graded + row.ungraded > 0 ? 'Move or delete its assignments first' : 'Remove category'} onClick={() => setCategories(c => c.filter(x => x.name !== row.name))}><Trash2 size={15} /></button>
        </div>)}
      </div>
      <form className="inline" onSubmit={e => { e.preventDefault(); addCategory(); }}>
        <input aria-label="New category name" value={newCategory} maxLength={80} onChange={e => setNewCategory(e.target.value)} placeholder="New category, e.g. Labs" />
        <button className="secondary-button" disabled={!newCategory.trim()}><Plus size={15} />Add category</button>
      </form>
      <details>
        <summary>Set weights from syllabus text</summary>
        <p className="muted">Paste the grading section, one category per line, like “Exams 40%”.</p>
        <textarea rows={5} value={weightText} onChange={e => setWeightText(e.target.value)} aria-label="Syllabus grading text" />
        <button className="secondary-button" onClick={() => { const found = extractWeights(weightText); setProposed(found.length ? found : null); setExtractError(found.length ? '' : 'No weights found. Use a category and percentage on each line.'); }}>Find weights</button>
        {proposed && <div className="extraction-preview">{proposed.map(p => <p key={p.name}>{p.name}<strong>{p.weight}%</strong></p>)}<button className="primary-button" onClick={applyExtracted}>Use these weights</button></div>}
        {extractError && <p className="error" role="alert">{extractError}</p>}
      </details>
    </section>

    {rows.map(row => {
      const items = mine.filter(a => a.category === row.name).sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
      if (!items.length) return null;
      return <section key={row.name} className="panel form-panel">
        <div className="section-heading"><h3>{row.name}</h3><span className="muted">{row.weight}% · average {pct(row.average)}</span></div>
        <div className="gradebook-items">{items.map(a => <div key={a.id} className="gradebook-item">
          <div><strong>{a.id.startsWith('what-if-') ? <input aria-label="Hypothetical item name" value={a.title} maxLength={160} onChange={e => patchAssignment(a.id, { title: e.target.value || 'Hypothetical item' })} /> : a.title}</strong><small className="muted">{formatDate(a.due)}{a.earned === null ? ' · not graded' : ` · ${((a.earned / a.points) * 100).toFixed(1)}%`}</small></div>
          <label className="score-input"><input aria-label={`${a.title} score`} type="number" min={0} step="0.01" placeholder="—" value={a.earned ?? ''} onChange={e => setScore(a, 'earned', e.target.value)} /> / <input aria-label={`${a.title} points possible`} type="number" min={0.01} step="0.01" value={a.points} onChange={e => setScore(a, 'points', e.target.value)} /></label>
          <select aria-label={`${a.title} category`} value={a.category} onChange={e => patchAssignment(a.id, { category: e.target.value })}>{working.categories.map(c => <option key={c.name}>{c.name}</option>)}</select>
          {a.id.startsWith('what-if-') && <button className="icon-button" aria-label="Remove hypothetical item" onClick={() => setDraft(d => d && { ...d, assignments: d.assignments.filter(x => x.id !== a.id) })}><Trash2 size={15} /></button>}
          {rowError[a.id] && <small className="error">{rowError[a.id]}</small>}
        </div>)}</div>
      </section>;
    })}
    {!mine.length && <div className="empty"><h3>No assignments yet</h3><p>Add assignments or sync from D2L, or use what-if mode to try hypothetical scores.</p></div>}
    <p className="muted">Grades are calculated from scores in ClassSync, not official records. Blank scores are left out; zeros count.</p>
  </div>;
}

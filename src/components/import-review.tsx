'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, X } from 'lucide-react';
import type { AcademicState } from '@/lib/model';
import { importPayloadSchema, mergeImport, type SyllabusFile } from '@/lib/d2l-import';
import { addProposals, proposeAssignments, type SyllabusProposal } from '@/lib/syllabus-items';
import { scanSyllabus } from '@/lib/syllabus-scan';
import { PDF_MIME } from '@/lib/syllabus';
import { base64ToBytes } from '@/lib/document-text';
import { materialFile } from '@/lib/material-files';
import { SyllabusProposalList, defaultSelection } from './syllabus-scan';
import { applyWeightPlan, needsWeights, planWeights } from '@/lib/syllabus-weights';
import type { SyllabusWeight } from '@/lib/syllabus';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
type SyllabusScanState = { file: SyllabusFile; courseName: string; status: 'scanning' | 'done' | 'error'; message?: string; proposals: SyllabusProposal[]; weights: SyllabusWeight[]; offerWeights: boolean };

function Details({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return <details><summary>{label} ({items.length})</summary><ul>{items.slice(0, 50).map((item, i) => <li key={i}>{item}</li>)}</ul>{items.length > 50 && <p className="muted">…and {items.length - 50} more</p>}</details>;
}

// Keeps the syllabus file with the class's materials (Mike's attachments store, this browser)
async function saveSyllabusMaterials(state: AcademicState, files: SyllabusFile[]): Promise<AcademicState> {
  let materials = state.materials;
  for (const file of files) {
    const id = `d2l-syllabus-${file.courseId}`;
    if (materials.some(m => m.id === id) || materials.length >= 200) continue;
    try {
      await materialFile(id, 'save', new File([base64ToBytes(file.base64)], file.fileName, { type: file.mimeType }));
      materials = [...materials, { id, courseId: file.courseId, title: `Syllabus · ${file.title}`.slice(0, 160), text: '', kind: 'material' }];
    } catch { /* browser storage full or unavailable: the dates are still imported */ }
  }
  return { ...state, materials };
}

// Shows what an import from D2L would change before anything is saved
export function ImportReview({ data, payload, school, onApply, onCancel }: { data: AcademicState; payload: unknown; school: string | null; onApply: (next: AcademicState, message: string) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scans, setScans] = useState<SyllabusScanState[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [useWeights, setUseWeights] = useState<Set<string>>(new Set());
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const result = useMemo(() => {
    try { return { ok: true as const, ...mergeImport(data, payload), syllabi: importPayloadSchema.parse(payload).syllabi }; }
    catch { return { ok: false as const }; }
  }, [data, payload]);

  // Scan each syllabus once per import, against the merged workspace so D2L items count as duplicates
  const syllabusKey = result.ok ? result.syllabi.map(s => s.courseId).join(',') : '';
  useEffect(() => {
    if (!result.ok || !result.syllabi.length) return;
    let active = true;
    const merged = result.state;
    setScans(result.syllabi.map(file => ({ file, courseName: merged.courses.find(c => c.id === file.courseId)?.name ?? 'Class', status: 'scanning', proposals: [], weights: [], offerWeights: false })));
    result.syllabi.forEach((file, index) => {
      const course = merged.courses.find(c => c.id === file.courseId);
      if (!course) return;
      scanSyllabus({ kind: file.mimeType === PDF_MIME ? 'pdf' : 'docx', base64: file.base64 }, course)
        .then(scan => {
          if (!active) return;
          const proposals = proposeAssignments(scan.items, course, merged);
          // Offer the syllabus's weights only when D2L didn't provide any for this class
          const offerWeights = scan.weights.length > 0 && needsWeights(course);
          setScans(current => current.map((s, i) => i === index ? { ...s, status: 'done', message: scan.method === 'ai' ? undefined : scan.note, proposals, weights: scan.weights, offerWeights } : s));
          setSelected(current => new Set([...current, ...defaultSelection(proposals)]));
          if (offerWeights) setUseWeights(current => new Set([...current, file.courseId]));
        })
        .catch(err => { if (active) setScans(current => current.map((s, i) => i === index ? { ...s, status: 'error', message: err instanceof Error ? err.message : 'Couldn’t scan this syllabus.' } : s)); });
    });
    return () => { active = false; };
  }, [syllabusKey]);

  const from = school ? `${school} D2L` : 'D2L';
  const syllabusChosen = scans.flatMap(s => s.proposals).filter(p => selected.has(p.assignment.id)).map(p => p.assignment);
  let headline = '', changes = 0;
  if (result.ok) {
    const s = result.summary;
    changes = s.newCourses.length + s.newAssignments.length + s.updatedAssignments.length + s.newAnnouncements.length + syllabusChosen.length;
    headline = changes
      ? [s.newCourses.length && plural(s.newCourses.length, 'new class'), s.newAssignments.length && plural(s.newAssignments.length, 'new assignment'), s.updatedAssignments.length && plural(s.updatedAssignments.length, 'updated assignment'), s.newAnnouncements.length && plural(s.newAnnouncements.length, 'new announcement'), syllabusChosen.length && plural(syllabusChosen.length, 'date') + ' from syllabi'].filter(Boolean).join(', ')
      : 'Everything is already up to date.';
  }

  async function apply() {
    if (!result.ok) return;
    setApplying(true);
    let next = addProposals(result.state, syllabusChosen);
    for (const scan of scans) {
      if (!scan.offerWeights || !useWeights.has(scan.file.courseId)) continue;
      try { next = applyWeightPlan(next, scan.file.courseId, planWeights(next, scan.file.courseId, scan.weights)); } catch { /* keep D2L's categories */ }
    }
    const withSyllabus = await saveSyllabusMaterials(next, result.syllabi);
    onApply(withSyllabus, changes ? `Added from ${from}: ${headline}` : 'Classes are up to date');
  }

  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <dialog className="assignment-modal import-review" ref={dialog} onCancel={onCancel} aria-labelledby="import-title">
    <div className="section-heading"><h2 id="import-title">Review your classes from {from}</h2><button type="button" className="icon-button" aria-label="Close review" onClick={onCancel}><X size={20} /></button></div>
    {!result.ok ? <>
      <p role="alert" className="error">This import couldn’t be read, so nothing was changed. Try syncing again.</p>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Close</button></div>
    </> : <>
      <p><strong>{headline}</strong></p>
      <p className="muted">Grades and weights come from the D2L gradebook. Your completed work, scores you entered, read announcements and class settings stay as you set them. Nothing is deleted.</p>
      <div className="import-details">
        <Details label="New classes" items={result.summary.newCourses} />
        <Details label="New assignments" items={result.summary.newAssignments} />
        <Details label="Updated assignments" items={result.summary.updatedAssignments} />
        <Details label="New announcements" items={result.summary.newAnnouncements} />
      </div>
      {scans.length > 0 && <div className="syllabus-review">
        <h3>From syllabi</h3>
        {scans.map(scan => <div key={scan.file.courseId}>
          <p><strong>{scan.courseName}</strong> · {scan.file.fileName}</p>
          {scan.status === 'scanning' && <p className="notice"><LoaderCircle size={14} className="spin" /> Reading the syllabus…</p>}
          {scan.status === 'error' && <p className="muted">{scan.message}</p>}
          {scan.status === 'done' && <>{scan.message && <p className="muted">{scan.message}</p>}
            {scan.offerWeights && <label className="weights-offer"><input type="checkbox" checked={useWeights.has(scan.file.courseId)} onChange={() => setUseWeights(current => { const next = new Set(current); if (next.has(scan.file.courseId)) next.delete(scan.file.courseId); else next.add(scan.file.courseId); return next; })} /> Use the syllabus grading weights: {scan.weights.map(w => `${w.name} ${w.weight}%`).join(', ')}</label>}
            <SyllabusProposalList proposals={scan.proposals} selected={selected} onToggle={toggle} /></>}
        </div>)}
      </div>}
      <div className="modal-actions">
        <button type="button" className="secondary-button" disabled={applying} onClick={onCancel}>Not now</button>
        <button type="button" className="primary-button" disabled={applying} onClick={() => void apply()}>{applying ? <LoaderCircle size={16} className="spin" /> : null}{changes ? 'Add to ClassSync' : 'Done'}<ArrowRight size={16} /></button>
      </div>
    </>}
  </dialog>;
}

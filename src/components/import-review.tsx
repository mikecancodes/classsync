'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { AcademicState } from '@/lib/model';
import { mergeImport } from '@/lib/d2l-import';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function Details({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return <details><summary>{label} ({items.length})</summary><ul>{items.slice(0, 50).map((item, i) => <li key={i}>{item}</li>)}</ul>{items.length > 50 && <p className="muted">…and {items.length - 50} more</p>}</details>;
}

// Shows what an import from D2L would change before anything is saved
export function ImportReview({ data, payload, school, onApply, onCancel }: { data: AcademicState; payload: unknown; school: string | null; onApply: (next: AcademicState, message: string) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const result = useMemo(() => {
    try { return { ok: true as const, ...mergeImport(data, payload) }; }
    catch { return { ok: false as const }; }
  }, [data, payload]);

  const from = school ? `${school} D2L` : 'D2L';
  let headline = '', changes = 0;
  if (result.ok) {
    const s = result.summary;
    changes = s.newCourses.length + s.newAssignments.length + s.updatedAssignments.length + s.newAnnouncements.length;
    headline = changes
      ? [s.newCourses.length && plural(s.newCourses.length, 'new class'), s.newAssignments.length && plural(s.newAssignments.length, 'new assignment'), s.updatedAssignments.length && plural(s.updatedAssignments.length, 'updated assignment'), s.newAnnouncements.length && plural(s.newAnnouncements.length, 'new announcement')].filter(Boolean).join(', ')
      : 'Everything is already up to date.';
  }

  return <dialog className="assignment-modal import-review" ref={dialog} onCancel={onCancel} aria-labelledby="import-title">
    <div className="section-heading"><h2 id="import-title">Review your classes from {from}</h2><button type="button" className="icon-button" aria-label="Close review" onClick={onCancel}><X size={20} /></button></div>
    {!result.ok ? <>
      <p role="alert" className="error">This import couldn’t be read, so nothing was changed. Try syncing again.</p>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Close</button></div>
    </> : <>
      <p><strong>{headline}</strong></p>
      <p className="muted">Your completed work, scores, read announcements and class settings stay as you set them. Nothing is deleted.</p>
      <div className="import-details">
        <Details label="New classes" items={result.summary.newCourses} />
        <Details label="New assignments" items={result.summary.newAssignments} />
        <Details label="Updated assignments" items={result.summary.updatedAssignments} />
        <Details label="New announcements" items={result.summary.newAnnouncements} />
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>Not now</button>
        <button type="button" className="primary-button" onClick={() => onApply(result.state, changes ? `Added from ${from}: ${headline}` : 'Classes are up to date')}>{changes ? 'Add to ClassSync' : 'Done'}<ArrowRight size={16} /></button>
      </div>
    </>}
  </dialog>;
}

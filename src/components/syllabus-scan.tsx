'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { CalendarPlus, LoaderCircle, ScanText, Upload } from 'lucide-react';
import { AcademicState, Course, formatDate } from '@/lib/model';
import { addProposals, proposeAssignments, type SyllabusProposal } from '@/lib/syllabus-items';
import { scanSyllabus, type ScanSource } from '@/lib/syllabus-scan';
import { DOCX_MIME, PDF_MIME } from '@/lib/syllabus';
import { fileToBase64 } from '@/lib/document-text';

const MAX_BYTES = 8 * 1024 * 1024;

// Checkbox list of proposed assignments; ones already in ClassSync start unchecked
export function SyllabusProposalList({ proposals, selected, onToggle }: { proposals: SyllabusProposal[]; selected: Set<string>; onToggle: (id: string) => void }) {
  if (!proposals.length) return <p className="muted">No dated items were found.</p>;
  return <ul className="syllabus-proposals">{proposals.map(({ assignment, duplicateOf }) => <li key={assignment.id}>
    <label>
      <input type="checkbox" checked={selected.has(assignment.id)} onChange={() => onToggle(assignment.id)} />
      <span><strong>{assignment.title}</strong> · {formatDate(assignment.due)}{duplicateOf ? <small className="muted"> · Already in ClassSync as “{duplicateOf}”</small> : null}</span>
    </label>
  </li>)}</ul>;
}

export const defaultSelection = (proposals: SyllabusProposal[]) => new Set(proposals.filter(p => !p.duplicateOf).map(p => p.assignment.id));

// Shows the exact text the scanner read, so students can check what was (and wasn't) picked up
export function ScannedText({ text }: { text?: string }) {
  if (text === undefined) return null;
  return <details className="scanned-text"><summary>Text that was scanned ({text.length.toLocaleString()} characters)</summary>{text.trim() ? <pre>{text.slice(0, 20000)}</pre> : <p className="muted">No text was found.</p>}</details>;
}

// Course page: scan an uploaded syllabus file or the pasted Syllabus text for due dates
export function SyllabusScan({ course, data, setData, notify }: { course: Course; data: AcademicState; setData: Dispatch<SetStateAction<AcademicState>>; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [proposals, setProposals] = useState<SyllabusProposal[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanned, setScanned] = useState<string | undefined>();

  async function run(source: ScanSource) {
    setBusy(true); setError(''); setNote(''); setProposals(null); setScanned(undefined);
    try {
      const result = await scanSyllabus(source, course);
      setScanned(result.scannedText);
      const next = proposeAssignments(result.items, course, data);
      setProposals(next); setSelected(defaultSelection(next));
      setNote(result.method === 'ai' ? `Found ${result.items.length} dated item${result.items.length === 1 ? '' : 's'} with AI. Check them before adding.` : result.note ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t scan this syllabus.');
    } finally { setBusy(false); }
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError('Choose a syllabus smaller than 8 MB.');
    const kind = file.type === PDF_MIME || /\.pdf$/i.test(file.name) ? 'pdf' : file.type === DOCX_MIME || /\.docx$/i.test(file.name) ? 'docx' : null;
    if (!kind) return setError('Choose a PDF or Word (.docx) syllabus.');
    await run({ kind, base64: await fileToBase64(file) });
  }

  function add() {
    const chosen = (proposals ?? []).filter(p => selected.has(p.assignment.id)).map(p => p.assignment);
    setData(current => addProposals(current, chosen));
    notify(`Added ${chosen.length} item${chosen.length === 1 ? '' : 's'} from the syllabus`);
    setProposals(null);
  }

  return <section className="panel form-panel syllabus-scan">
    <h2><CalendarPlus size={18} /> Pull due dates from the syllabus</h2>
    <p className="muted">ClassSync reads the syllabus and suggests assignments, quizzes and exams with their dates. You choose what to add.</p>
    <div className="inline">
      <label className="upload-label"><Upload size={16} />Scan a PDF or Word file<input type="file" accept=".pdf,.docx" disabled={busy} onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button type="button" className="secondary-button" disabled={busy || !course.syllabus.trim()} onClick={() => void run({ kind: 'text', text: course.syllabus })}><ScanText size={16} />Scan the syllabus text above</button>
    </div>
    {busy && <p role="status" className="notice"><LoaderCircle size={14} className="spin" /> Reading the syllabus…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {note && <p className="notice">{note}</p>}
    <ScannedText text={scanned} />
    {proposals && <>
      <SyllabusProposalList proposals={proposals} selected={selected} onToggle={id => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />
      <div className="inline"><button type="button" className="primary-button" disabled={!selected.size} onClick={add}>Add {selected.size} to assignments</button><button type="button" className="secondary-button" onClick={() => setProposals(null)}>Discard</button></div>
    </>}
  </section>;
}

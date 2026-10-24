'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { FileText, LoaderCircle, Scale, Upload } from 'lucide-react';
import { AcademicState, Course } from '@/lib/model';
import { findSyllabusWeights } from '@/lib/syllabus-rules';
import { applyWeightPlan, needsWeights, planWeights, type WeightPlan } from '@/lib/syllabus-weights';
import { parseSyllabusWeights, DOCX_MIME, PDF_MIME } from '@/lib/syllabus';
import { scanSyllabus, type ScanSource } from '@/lib/syllabus-scan';
import { fileToBase64 } from '@/lib/document-text';
import { materialFile } from '@/lib/material-files';
import { ScannedText } from './syllabus-scan';
import { findSyllabusMaterial } from './syllabus-viewer';

const MAX_BYTES = 8 * 1024 * 1024;
const kindOf = (file: File) => file.type === PDF_MIME || /\.pdf$/i.test(file.name) ? 'pdf' : file.type === DOCX_MIME || /\.docx$/i.test(file.name) ? 'docx' : null;

// Pulls the grading breakdown from the class syllabus into the calculator, after review
export function SyllabusWeightsPanel({ course, data, setData, notify }: { course: Course; data: AcademicState; setData: Dispatch<SetStateAction<AcademicState>>; notify: (message: string) => void }) {
  const savedSyllabus = findSyllabusMaterial(data, course.id);
  const hasText = Boolean(course.syllabus.trim());
  const suggest = needsWeights(course) && (Boolean(savedSyllabus) || hasText);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState<WeightPlan | null>(null);
  const [pasted, setPasted] = useState('');
  const [scanned, setScanned] = useState<string | undefined>();

  function review(weights: { name: string; weight: number }[], method: string) {
    if (!weights.length) { setPlan(null); setError('No grading weights were found. Paste the grading section (e.g. “Exams 40%”) below.'); return; }
    setError(''); setNote(method);
    setPlan(planWeights(data, course.id, weights));
  }

  async function scan(source: ScanSource) {
    setBusy(true); setError(''); setNote(''); setPlan(null); setScanned(undefined);
    try {
      const result = await scanSyllabus(source, course);
      setScanned(result.scannedText);
      review(result.weights, result.method === 'ai' ? 'Read with AI. Check them against the syllabus.' : result.note ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t read the syllabus.');
    } finally { setBusy(false); }
  }

  async function scanFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError('Choose a syllabus smaller than 8 MB.');
    const kind = kindOf(file);
    if (!kind) return setError('The syllabus must be a PDF or Word (.docx) file to scan.');
    await scan({ kind, base64: await fileToBase64(file) });
  }

  async function scanSaved() {
    if (!savedSyllabus) return;
    try {
      const file = await materialFile(savedSyllabus.id);
      if (file) return await scanFile(file);
      if (savedSyllabus.text.trim()) return await scan({ kind: 'text', text: savedSyllabus.text });
      setError('The saved syllabus file isn’t in this browser. Upload it again or paste the grading section.');
    } catch { setError('Couldn’t open the saved syllabus.'); }
  }

  function apply() {
    if (!plan) return;
    try {
      setData(current => applyWeightPlan(current, course.id, planWeights(current, course.id, plan.categories.filter(c => c.weight > 0))));
      notify(`Weights from the syllabus applied${plan.moves.length ? `; ${plan.moves.length} assignment${plan.moves.length === 1 ? '' : 's'} moved to matching categories` : ''}`);
      setPlan(null); setOpen(false);
    } catch { setError('These weights couldn’t be applied. Check the category names.'); }
  }

  if (!open && !suggest) return <button type="button" className="secondary-button" onClick={() => setOpen(true)}><Scale size={15} />Update weights from syllabus</button>;

  return <section className="panel form-panel syllabus-weights">
    <div className="section-heading"><h2><Scale size={18} /> Weights from the syllabus</h2>{!suggest && <button type="button" className="text-button" onClick={() => { setOpen(false); setPlan(null); }}>Close</button>}</div>
    {suggest && <p className="notice">This class still uses a single catch-all category. Your syllabus likely lists the real grading weights.</p>}
    <div className="inline">
      {savedSyllabus && <button type="button" className="primary-button" disabled={busy} onClick={() => void scanSaved()}><FileText size={15} />Read “{savedSyllabus.title}”</button>}
      {hasText && <button type="button" className="secondary-button" disabled={busy} onClick={() => void scan({ kind: 'text', text: course.syllabus })}>Read the Syllabus tab text</button>}
      <label className="upload-label"><Upload size={15} />Upload syllabus<input type="file" accept=".pdf,.docx" disabled={busy} onChange={e => { void scanFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
    </div>
    <details>
      <summary>Or paste the grading section</summary>
      <textarea rows={4} value={pasted} onChange={e => setPasted(e.target.value)} placeholder={'Exams 40%\nLabs 25%\nHomework 20%\nParticipation 15%'} aria-label="Grading section" />
      <button type="button" className="secondary-button" disabled={!pasted.trim()} onClick={() => review(parseSyllabusWeights({ weights: findSyllabusWeights(pasted) }), 'Read from the pasted text.')}>Find weights</button>
    </details>
    {busy && <p role="status" className="notice"><LoaderCircle size={14} className="spin" /> Reading the syllabus…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <ScannedText text={scanned} />
    {plan && <div className="weights-plan">
      {note && <p className="muted">{note}</p>}
      <ul>{plan.categories.filter(c => c.weight > 0).map(c => <li key={c.name}>{c.name}<strong>{c.weight}%</strong></li>)}</ul>
      <p className={Math.abs(plan.total - 100) < 0.01 ? 'muted' : 'error'}>Total {plan.total.toFixed(1)}%{Math.abs(plan.total - 100) < 0.01 ? '' : '. Check the syllabus; you can fix weights after applying.'}</p>
      {plan.moves.length > 0 && <details><summary>{plan.moves.length} assignment{plan.moves.length === 1 ? '' : 's'} will move to matching categories</summary><ul>{plan.moves.slice(0, 50).map(m => <li key={m.id}>{m.title}: {m.from} → {m.to}</li>)}</ul></details>}
      {plan.kept.length > 0 && <p className="muted">Kept at 0% because some assignments didn’t match: {plan.kept.join(', ')}. Move them with each assignment’s category menu.</p>}
      <div className="inline"><button type="button" className="primary-button" onClick={apply}>Use these weights</button><button type="button" className="secondary-button" onClick={() => setPlan(null)}>Discard</button></div>
    </div>}
  </section>;
}

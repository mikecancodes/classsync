'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Download, ExternalLink, FileText, Trash2, Upload } from 'lucide-react';
import type { AcademicState, Course } from '@/lib/model';
import { materialFile, validateMaterialFile } from '@/lib/material-files';
import { docxToText } from '@/lib/document-text';

// The class's syllabus file: where it came from, a preview, and the text scans read from it.
// D2L sync saves it as d2l-syllabus-<class>; uploads here use syllabus-<class>.

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
const isDocx = (file: File) => /\.docx$/i.test(file.name) || file.type.includes('wordprocessingml');

export function findSyllabusMaterial(data: AcademicState, courseId: string) {
  const mine = data.materials.filter(m => m.courseId === courseId);
  return mine.find(m => m.id === `d2l-syllabus-${courseId}`) ?? mine.find(m => m.id === `syllabus-${courseId}`) ?? mine.find(m => /syllabus/i.test(m.title));
}

export function SyllabusViewer({ course, data, setData, notify }: { course: Course; data: AcademicState; setData: Dispatch<SetStateAction<AcademicState>>; notify: (message: string) => void }) {
  const material = findSyllabusMaterial(data, course.id);
  const [file, setFile] = useState<{ file: File; url: string; text?: string } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true, url: string | undefined;
    setFile(null); setError('');
    if (!material) return;
    materialFile(material.id).then(async found => {
      if (!active) return;
      if (!found) { setError('This syllabus file isn’t saved in this browser. Sync again or upload it.'); return; }
      url = URL.createObjectURL(found);
      let text: string | undefined;
      if (isDocx(found)) {
        try { text = docxToText(new Uint8Array(await found.arrayBuffer())); } catch (err) { text = err instanceof Error ? err.message : 'This Word file couldn’t be read.'; }
      }
      if (active) setFile({ file: found, url, text });
    }).catch(() => { if (active) setError('Couldn’t open the saved syllabus.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [material?.id, revision]);

  async function upload(chosen?: File) {
    if (!chosen) return;
    setError('');
    try {
      await validateMaterialFile(chosen);
      if (!isPdf(chosen) && !isDocx(chosen)) throw new Error('Choose a PDF or Word (.docx) syllabus so it can be scanned.');
      if (chosen.size > 8 * 1024 * 1024) throw new Error('Choose a syllabus smaller than 8 MB.');
      // Replace whatever is there; a D2L copy is replaced by this upload
      const id = material?.id ?? `syllabus-${course.id}`;
      await materialFile(id, 'save', chosen);
      setData(current => ({ ...current, materials: [...current.materials.filter(m => m.id !== id), { id, courseId: course.id, title: `Syllabus · ${chosen.name}`.slice(0, 160), text: '', kind: 'material' }] }));
      setRevision(r => r + 1);
      notify('Syllabus saved');
    } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t save this file.'); }
  }

  async function remove() {
    if (!material || !window.confirm('Remove the saved syllabus file from this class?')) return;
    await materialFile(material.id, 'delete').catch(() => undefined);
    setData(current => ({ ...current, materials: current.materials.filter(m => m.id !== material.id) }));
    notify('Syllabus file removed');
  }

  const source = material?.id.startsWith('d2l-syllabus-') ? 'From D2L sync' : 'Uploaded';
  return <section className="panel form-panel syllabus-viewer">
    <div className="section-heading"><h2><FileText size={18} /> Syllabus file</h2>{material && <span className="badge progress">{source}</span>}</div>
    {!material && <p className="muted">No syllabus file yet. Sync from D2L (it picks up a file titled “syllabus”) or upload one here.</p>}
    {file && <>
      <p className="muted">{file.file.name} · {(file.file.size / 1024).toFixed(0)} KB</p>
      <div className="inline">
        <a className="secondary-button" href={file.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Open in new tab</a>
        <a className="secondary-button" href={file.url} download={file.file.name}><Download size={15} />Download</a>
        <button type="button" className="icon-button" aria-label="Remove syllabus file" onClick={() => void remove()}><Trash2 size={15} /></button>
      </div>
      {isPdf(file.file) && <iframe className="syllabus-frame" title={`${course.code} syllabus preview`} src={file.url} />}
      {file.text !== undefined && <pre className="syllabus-text" aria-label="Syllabus text">{file.text.slice(0, 60000)}</pre>}
    </>}
    {error && <p role="alert" className="error">{error}</p>}
    <label className="upload-label"><Upload size={15} />{material ? 'Replace syllabus file' : 'Upload syllabus'}<input type="file" accept=".pdf,.docx" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
    <p className="muted">Due-date scans and the grade calculator’s weight lookup read this file, or the syllabus text below. After a scan you can see exactly what text was read.</p>
  </section>;
}

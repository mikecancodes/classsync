'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { AcademicState, Course, Material } from '@/lib/model';
import { MATERIAL_ACCEPT, materialFile, validateMaterialFile } from '@/lib/material-files';

type Props = { course: Course; data: AcademicState; setData: Dispatch<SetStateAction<AcademicState>>; notify: (message: string) => void };

export function Materials({ course, data, setData, notify }: Props) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File>();
  const [editing, setEditing] = useState<Material>();
  const [hasAttachment, setHasAttachment] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [revision, setRevision] = useState(0);

  function reset() { setTitle(''); setText(''); setFile(undefined); setEditing(undefined); setHasAttachment(false); setError(''); }
  async function selectFile(selected?: File) {
    if (!selected) return;
    try {
      await validateMaterialFile(selected);
      setFile(selected); setTitle(current => current || selected.name.slice(0, 160)); setError('');
    } catch (cause) { setError((cause as Error).message); }
  }
  async function save() {
    setBusy(true); setError('');
    try {
      const id = editing?.id ?? crypto.randomUUID();
      if (file) await materialFile(id, 'save', file);
      const material: Material = { id, courseId: course.id, title: title.trim(), text, kind: editing?.kind ?? 'notes' };
      setData(current => ({ ...current, materials: editing ? current.materials.map(item => item.id === id ? material : item) : [...current.materials, material] }));
      setRevision(current => current + 1); reset(); notify('Material saved');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="tool-layout"><section className="panel form-panel">
    <h2>{editing ? 'Edit material' : 'Add course material'}</h2>
    <label>Title<input maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="Week 8 · Lecture notes" /></label>
    <div className={`material-dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (busy) return; if (event.dataTransfer.files.length !== 1) { setError('Upload one file at a time.'); return; } void selectFile(event.dataTransfer.files[0]); }}>
      <Upload size={24} aria-hidden="true" />
      <strong>Drop your notes here</strong>
      <p>PDF, Word (.doc, .docx), or images (PNG, JPG, WebP, GIF). Up to 10 MB per file.</p>
      <label className="upload-label">Choose file<input aria-label="Upload notes or course material" type="file" accept={MATERIAL_ACCEPT} disabled={busy} onChange={event => { void selectFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      {file && <p role="status">Selected: {file.name} <button type="button" className="text-button" onClick={() => setFile(undefined)}>Clear selection</button></p>}
      {!file && hasAttachment && <p>Your existing attachment will be kept. Choose a file to replace it.</p>}
    </div>
    <label>Notes (optional with a file)<textarea rows={6} maxLength={40000} value={text} onChange={event => setText(event.target.value)} placeholder="Add a description or type your notes…" /></label>
    <p className="muted">Files are saved in this browser. Download a copy to keep a backup. Cloud saves and workspace exports include text notes, but do not include attached files.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="course-page-actions"><button className="primary-button" disabled={busy || !title.trim() || (!text.trim() && !file && !hasAttachment) || (!editing && data.materials.length >= 200)} onClick={() => void save()}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save material'}</button>{editing && <button className="secondary-button" disabled={busy} onClick={reset}>Cancel editing</button>}</div>
  </section><div className="material-list">{data.materials.filter(item => item.courseId === course.id).map(item => <article className="panel form-panel" key={item.id}>
    <div className="section-heading"><h3><FileText size={18} />{item.title}</h3><button className="icon-button" aria-label={`Delete ${item.title}`} onClick={async () => { if (!window.confirm(`Delete “${item.title}” and its attachment?`)) return; try { await materialFile(item.id, 'delete'); setData(current => ({ ...current, materials: current.materials.filter(row => row.id !== item.id) })); if (editing?.id === item.id) reset(); } catch (cause) { setError((cause as Error).message); } }}><Trash2 size={16} /></button></div>
    {item.text && <p className="material-text">{item.text}</p>}
    <Attachment id={item.id} revision={revision} emptyText={!item.text} />
    <button className="secondary-button" onClick={async () => { try { const attached = await materialFile(item.id); setEditing(item); setTitle(item.title); setText(item.text); setFile(undefined); setHasAttachment(Boolean(attached)); setError(''); } catch (cause) { setError((cause as Error).message); } }}>Edit material</button>
  </article>)}{!data.materials.some(item => item.courseId === course.id) && <div className="empty">Upload your first notes to get started.</div>}</div></div>;
}

function Attachment({ id, revision, emptyText }: { id: string; revision: number; emptyText: boolean }) {
  const [attachment, setAttachment] = useState<{ file: File; url: string }>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    setAttachment(undefined); setError('');
    materialFile(id).then(file => { if (!active) return; if (file) { url = URL.createObjectURL(file); setAttachment({ file, url }); } else if (emptyText) setError('The attached file is not available in this browser. Upload it here to restore access.'); }).catch(() => { if (active) setError('Unable to access the attached file in this browser.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id, revision, emptyText]);
  if (!attachment) return error ? <p className="muted">{error}</p> : null;
  const { file, url } = attachment;
  const image = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
  return <div className="material-attachment">{image && <img src={url} alt={file.name} />}<p>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p><a className="secondary-button" href={url} download={file.name}>Download file</a></div>;
}

'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, ExternalLink, LoaderCircle, Plug, RefreshCw, Search } from 'lucide-react';
import { School, customSchool, findSchools, normalizeD2LUrl, schoolForOrigin } from '@/lib/schools';
import type { ExtensionHandle } from '@/lib/extension-bridge';

const SCHOOL_KEY = 'classsync-d2l-school';

function loadSchool(): School | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SCHOOL_KEY) ?? 'null');
    return saved && typeof saved.d2lOrigin === 'string' && 'origin' in normalizeD2LUrl(saved.d2lOrigin) ? saved : null;
  } catch { return null; }
}

function saveSchool(school: School) {
  try { localStorage.setItem(SCHOOL_KEY, JSON.stringify(school)); } catch { /* still works for this visit */ }
}

export function ConnectPage({ extension }: { extension: ExtensionHandle }) {
  const [school, setSchool] = useState<School | null>(null);
  const [query, setQuery] = useState('');
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => { setSchool(loadSchool()); }, []);
  // Prefer the school the extension is already connected to
  useEffect(() => {
    if (extension.d2lOrigin && school?.d2lOrigin !== extension.d2lOrigin) setSchool(schoolForOrigin(extension.d2lOrigin) ?? customSchool(extension.d2lOrigin));
  }, [extension.d2lOrigin]);
  useEffect(() => { if (extension.progressState && extension.progressState !== 'running') setConnecting(false); }, [extension.progress, extension.progressState]);

  function choose(next: School) { setSchool(next); saveSchool(next); setLinkError(''); }
  function applyLink() {
    const result = normalizeD2LUrl(link);
    if ('error' in result) return setLinkError(result.error);
    choose(schoolForOrigin(result.origin) ?? customSchool(result.origin));
    setLink('');
  }
  async function copyExtensionsUrl() {
    try { await navigator.clipboard.writeText('chrome://extensions'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* user can type it */ }
  }
  function connect() {
    if (!school) return;
    setConnecting(true);
    extension.send('connect', { d2lOrigin: school.d2lOrigin, schoolName: school.shortName });
  }

  const results = findSchools(query);
  const connectedHere = extension.connected && extension.d2lOrigin === school?.d2lOrigin;

  return <div className="connect-page">
    <p className="muted">Three steps to bring your classes, due dates and announcements from D2L into ClassSync. You stay signed in to D2L yourself; ClassSync never sees your password.</p>

    <section className="panel form-panel connect-step">
      <div className="section-heading"><h2>1. Get the ClassSync extension</h2>{extension.installed ? <span className="badge done"><CheckCircle2 size={13} /> Installed{extension.version ? ` · v${extension.version}` : ''}</span> : <span className="badge todo">{extension.checked ? 'Not detected' : 'Checking…'}</span>}</div>
      {extension.installed ? <p>The extension is ready. You can move on to step 2.</p> : <>
        <a className="primary-button" href="/classsync-extension.zip" download><Download size={16} />Download extension (.zip)</a>
        <ol className="connect-guide">
          <li><strong>Unzip</strong> the downloaded file. You’ll get a <code>classsync-extension</code> folder.</li>
          <li>Open <code>chrome://extensions</code> in a new tab <button type="button" className="text-button" onClick={copyExtensionsUrl}><Copy size={13} />{copied ? 'Copied' : 'Copy'}</button></li>
          <li>Turn on <strong>Developer mode</strong> (top right).</li>
          <li>Click <strong>Load unpacked</strong> and choose the <code>classsync-extension</code> folder.</li>
        </ol>
        <p className="notice">Works in Chrome, Edge and Brave. This page updates by itself once the extension is installed.</p>
      </>}
    </section>

    <section className="panel form-panel connect-step">
      <div className="section-heading"><h2>2. Choose your school</h2>{school && <span className="badge done"><CheckCircle2 size={13} /> {school.shortName}</span>}</div>
      <label className="assignment-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search for your school" aria-label="Search for your school" /></label>
      <div className="connect-schools">
        {results.map(item => <button type="button" key={item.id} className={`integration-row ${school?.d2lOrigin === item.d2lOrigin ? 'selected' : ''}`} aria-pressed={school?.d2lOrigin === item.d2lOrigin} onClick={() => choose(item)}>
          <span className="integration-logo blue">{item.shortName.slice(0, 3)}</span>
          <div><strong>{item.name}</strong><small>{item.system ? `${item.system} · ` : ''}{new URL(item.d2lOrigin).hostname}</small></div>
        </button>)}
        {!results.length && <p className="muted">No match yet. Paste your school’s D2L link below.</p>}
      </div>
      <form onSubmit={e => { e.preventDefault(); applyLink(); }}>
        <label>School not listed? Paste any page from your school’s D2L
          <input value={link} onChange={e => { setLink(e.target.value); setLinkError(''); }} placeholder="e.g. https://d2l.yourschool.edu/d2l/home" />
        </label>
        <button type="submit" className="secondary-button" disabled={!link.trim()}>Use this D2L</button>
        {linkError && <p role="alert" className="error">{linkError}</p>}
      </form>
    </section>

    <section className="panel form-panel connect-step">
      <div className="section-heading"><h2>3. Connect and sign in</h2>{connectedHere && <span className="badge done"><CheckCircle2 size={13} /> Connected</span>}</div>
      {!school ? <p className="muted">Choose your school first.</p> : <>
        <p>{connectedHere ? `ClassSync is connected to ${school.shortName} D2L. Sync any time to pull in new work.` : `We’ll ask your permission to read ${school.shortName} D2L, then open its sign-in page. After you sign in, your classes show up here for review.`}</p>
        <div className="inline">
          {connectedHere
            ? <button type="button" className="primary-button" onClick={() => extension.send('sync-now')}><RefreshCw size={16} />Sync now</button>
            : <button type="button" className="primary-button" disabled={!extension.installed || connecting} onClick={connect}>{connecting ? <LoaderCircle size={16} className="spin" /> : <Plug size={16} />}Connect to {school.shortName} D2L</button>}
          <a className="secondary-button" href={`${school.d2lOrigin}/d2l/home`} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Open my D2L</a>
        </div>
        {!extension.installed && <p className="muted">Install the extension (step 1) to connect.</p>}
        {extension.progress && <p role="status" className={extension.progressState === 'error' || extension.progressState === 'needs_login' ? 'error' : 'notice'}>{extension.progress}</p>}
      </>}
    </section>
  </div>;
}

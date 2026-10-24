'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Brain, ChevronDown, LoaderCircle, Send, Sparkles } from 'lucide-react';
import { AcademicState, dateKey } from '@/lib/model';
import { answerAcademicQuestion } from '@/lib/academic-assistant';
import { supabase } from '@/lib/supabase';

type Message = { id: string; role: 'user' | 'assistant'; text: string; mode?: string };
const suggestions = ['What should I work on today?', 'What is due tomorrow?', 'What assignments am I missing?', 'Help me organize my study schedule.'];

export function Chatbot({ data }: { data: AcademicState }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ai', { signal: controller.signal }).then(r => r.json())
      .then(result => setAiAvailable(result.available === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (messages.length || busy) history.current?.scrollTo({ top: history.current.scrollHeight });
  }, [messages, busy, open]);

  function collapse() {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }

  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.stopPropagation(); collapse(); }

  }

  async function send(raw = question) {
    const text = raw.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setQuestion(''); setError(''); setBusy(true);
    setMessages(old => [...old, { id: crypto.randomUUID(), role: 'user' as const, text }].slice(-60));
    try {
      let answer: string;
      let mode = 'Local · Rule-based';
      if (!useAI) {
        answer = answerAcademicQuestion(text, data);
      } else {
        const content = JSON.stringify({ today: dateKey(), dueSoonDefinition: 'Today through the next 7 calendar days, inclusive', courses: data.courses.map(c => ({ id: c.id, name: c.name, code: c.code })), assignments: data.assignments });
        if (content.length > 40000) throw new Error('This workspace is too large for AI chat. Use local answers or select course material on the study assistant page.');
        const token = (await supabase?.auth.getSession())?.data.session?.access_token;
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ task: 'question', question: text, content }),
          signal: AbortSignal.timeout(60000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'AI is unavailable.');
        if (result.mode !== 'ai' || !result.text?.trim()) throw new Error('AI did not return a generated answer. Choose local answers to continue.');
        answer = result.text; mode = 'AI generated · Verify important details';
      }
      setMessages(old => [...old, { id: crypto.randomUUID(), role: 'assistant', text: answer, mode }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to answer. Please try again.');
      setQuestion(text);
    } finally {
      inFlight.current = false; setBusy(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  }

  return <>
    <button ref={launcher} className={`chat-launcher docked-launcher ${open ? 'chat-launcher-hidden' : ''}`} aria-expanded={open} aria-controls="classsync-chat" onClick={() => setOpen(true)}>
      <Brain size={22} /> Ask ClassSync AI <Sparkles size={15} />
    </button>
    <section id="classsync-chat" className={`chat-panel docked-chat ${open ? 'mobile-chat-open' : ''}`} role="complementary" aria-label="ClassSync AI" onKeyDown={handleKeys}>
      <header className="chat-heading">
        <span className="chat-brain"><Brain size={25} /></span>
        <div><h2>ClassSync AI</h2><p>{useAI ? 'Server-side AI selected' : 'Local assistant · Rule-based'}</p></div>
        <button className="icon-button mobile-chat-collapse" aria-label="Collapse ClassSync AI" onClick={collapse}><ChevronDown size={22} /></button>
      </header>
      <div className="chat-mode">
        <label><input type="checkbox" checked={useAI} disabled={!aiAvailable || busy} onChange={e => setUseAI(e.target.checked)} /> Use connected AI</label>
        <small>{useAI ? 'Sending shares coursework with OpenAI. Each question uses current data.' : aiAvailable ? 'AI is configured. Sign-in may be required.' : 'No AI connection required. Answers stay on this device.'}</small>
      </div>
      <div ref={history} className="chat-history" role="log" aria-live="polite" aria-relevant="additions">
        <div className="chat-intro"><span><Brain size={30} /></span><h3>Your study sidekick.</h3><p>Ask about your classes, deadlines, or what to work on next.</p></div>
        {!messages.length && <div className="chat-suggestions">{suggestions.map(text => <button key={text} onClick={() => send(text)}>{text}<Send size={13} /></button>)}</div>}
        {messages.map(message => <article key={message.id} className={`chat-message ${message.role}`}><small>{message.role === 'user' ? 'You' : message.mode}</small><p>{message.text}</p></article>)}
        {busy && <p className="chat-thinking"><LoaderCircle size={14} className="spin" /> Working through your question…</p>}
      </div>
      {error && <p className="chat-error" role="alert">{error}</p>}
      <form className="chat-composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="chat-question">Ask about your coursework</label>
        <input id="chat-question" ref={input} value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} placeholder="What do I have due this week?" autoComplete="off" />
        <button aria-label="Send message" disabled={busy || !question.trim()}><Send size={18} /></button>
      </form>
      <div className="chat-footnote">Based on your current workspace. History stays in this session.</div>
    </section>
  </>;
}

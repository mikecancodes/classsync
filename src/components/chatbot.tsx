'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Brain, ChevronDown, LoaderCircle, Send, Sparkles } from 'lucide-react';
import { AcademicState, dateKey } from '@/lib/model';
import { answerAcademicQuestion } from '@/lib/academic-assistant';
import { runTool, toolStatusLabel } from '@/lib/chat-tools';
import { MAX_TOOL_ROUNDS, type ChatMessage } from '@/lib/chat-request';
import { supabase } from '@/lib/supabase';

type Message = { id: string; role: 'user' | 'assistant'; text: string; mode?: string };
type AssistantTurn = Extract<ChatMessage, { role: 'assistant' }>;
type ChatReply =
  | { type: 'tools'; message: AssistantTurn; calls: { id: string; name: string; args: Record<string, unknown> }[] }
  | { type: 'text'; message: AssistantTurn; text: string };

const suggestions = ['What should I work on today?', 'What is due tomorrow?', 'What assignments am I missing?', 'Any new announcements?', 'How are my grades looking?'];
const HISTORY_MESSAGES = 10;
const AI_MODE = 'ClassSync AI';
const LOCAL_MODE = 'Answered locally · Rule-based';

// Recent conversation as chat messages (text only), merging consecutive same-role turns
function historyMessages(messages: Message[]): ChatMessage[] {
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages.slice(-HISTORY_MESSAGES)) {
    const last = history[history.length - 1];
    if (last?.role === message.role) last.content += `\n\n${message.text}`;
    else history.push({ role: message.role, content: message.text });
  }
  while (history[0]?.role === 'assistant') history.shift();
  return history;
}

export function Chatbot({ data }: { data: AcademicState }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Thinking…');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [signInRequired, setSignInRequired] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [error, setError] = useState('');
  const [failedQuestion, setFailedQuestion] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  // Tools always read the latest workspace, even if it changes mid-conversation
  const dataRef = useRef(data);
  dataRef.current = data;

  const aiReady = aiConfigured && (!signInRequired || signedIn);
  const aiActive = aiReady && useAI;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ai', { signal: controller.signal }).then(r => r.json())
      .then(result => { setAiConfigured(result.chatAvailable === true || result.available === true); setSignInRequired(result.chatSignInRequired !== false); }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: session }) => setSignedIn(Boolean(session.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (messages.length || busy) history.current?.scrollTo({ top: history.current.scrollHeight });
  }, [messages, busy, open, status]);

  function collapse() {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }

  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.stopPropagation(); collapse(); }

  }

  async function postChat(messages: ChatMessage[], token: string | undefined): Promise<ChatReply> {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ messages, today: dateKey(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      signal: AbortSignal.timeout(60000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'AI is unavailable right now.');
    return result;
  }

  // Ask the AI; when it requests data, run the lookup here and send back only those rows
  async function askAI(text: string, earlier: Message[]) {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const conversation: ChatMessage[] = [...historyMessages(earlier), { role: 'user', content: text }];
    for (let rounds = 0; ; rounds++) {
      const reply = await postChat(conversation, token);
      if (reply.type === 'text') return reply.text;
      if (rounds === MAX_TOOL_ROUNDS) throw new Error('That question needed too many lookups. Try asking something more specific.');
      setStatus(toolStatusLabel(reply.calls[0]?.name ?? ''));
      conversation.push(reply.message);
      for (const call of reply.calls) conversation.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(runTool(call.name, call.args, dataRef.current)) });
    }
  }

  function answerLocally(text: string) {
    setError(''); setFailedQuestion('');
    setMessages(old => [...old, { id: crypto.randomUUID(), role: 'assistant', text: answerAcademicQuestion(text, dataRef.current), mode: LOCAL_MODE }]);
  }

  async function send(raw = question) {
    const text = raw.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    const earlier = messages;
    setQuestion(''); setError(''); setFailedQuestion(''); setStatus('Thinking…'); setBusy(true);
    setMessages(old => [...old, { id: crypto.randomUUID(), role: 'user' as const, text }].slice(-60));
    try {
      if (aiActive) {
        const answer = await askAI(text, earlier);
        setMessages(old => [...old, { id: crypto.randomUUID(), role: 'assistant', text: answer, mode: AI_MODE }]);
      } else {
        answerLocally(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to answer. Please try again.');
      setFailedQuestion(text);
    } finally {
      inFlight.current = false; setBusy(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  }

  const modeNote = aiActive ? 'The AI only sees the items it looks up for each question.'
    : aiConfigured && !aiReady ? 'Sign in under Settings to chat with AI. Answers are local for now.'
    : aiReady ? 'AI is off. Answers come from your workspace on this device.'
    : 'AI is not configured for this site yet. Local answers use rules.';
  const asked = new Set(messages.filter(m => m.role === 'user').map(m => m.text));
  const followUps = suggestions.filter(s => !asked.has(s)).slice(0, 2);

  return <>
    <button ref={launcher} className={`chat-launcher docked-launcher ${open ? 'chat-launcher-hidden' : ''}`} aria-expanded={open} aria-controls="classsync-chat" onClick={() => setOpen(true)}>
      <Brain size={22} /> Ask ClassSync AI <Sparkles size={15} />
    </button>
    <section id="classsync-chat" className={`chat-panel docked-chat ${open ? 'mobile-chat-open' : ''}`} role="complementary" aria-label="ClassSync AI" onKeyDown={handleKeys}>
      <header className="chat-heading">
        <span className="chat-brain"><Brain size={25} /></span>
        <div><h2>ClassSync AI</h2><p>{aiActive ? 'AI · reads your ClassSync data' : 'Local assistant · Rule-based'}</p></div>
        <button className="icon-button mobile-chat-collapse" aria-label="Collapse ClassSync AI" onClick={collapse}><ChevronDown size={22} /></button>
      </header>
      <div className="chat-mode">
        <label><input type="checkbox" role="switch" checked={aiActive} disabled={!aiReady || busy} onChange={e => setUseAI(e.target.checked)} /> Use AI</label>
        <small>{modeNote}</small>
      </div>
      <div ref={history} className="chat-history" role="log" aria-live="polite" aria-relevant="additions">
        <div className="chat-intro"><span><Brain size={30} /></span><h3>Hi! I'm your study sidekick.</h3><p>Ask me about deadlines, announcements, grades, or your notes, and I'll help you figure out what to do next.</p></div>
        {!messages.length && <div className="chat-suggestions">{suggestions.map(text => <button key={text} onClick={() => send(text)}>{text}<Send size={13} /></button>)}</div>}
        {messages.map(message => <article key={message.id} className={`chat-message ${message.role}`}><small>{message.role === 'user' ? 'You' : message.mode}</small><p>{message.text}</p></article>)}
        {busy && <p className="chat-thinking"><LoaderCircle size={14} className="spin" /> {status}</p>}
        {!busy && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && followUps.length > 0 && <div className="chat-suggestions">{followUps.map(text => <button key={text} onClick={() => send(text)}>{text}<Send size={13} /></button>)}</div>}
      </div>
      {error && <div className="chat-error" role="alert">{error}{failedQuestion && <> <button className="text-button" onClick={() => answerLocally(failedQuestion)}>Answer locally instead</button></>}</div>}
      <form className="chat-composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="chat-question">Ask about your coursework</label>
        <input id="chat-question" ref={input} value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} placeholder="What do I have due this week?" autoComplete="off" />
        <button aria-label="Send message" disabled={busy || !question.trim()}><Send size={18} /></button>
      </form>
      <div className="chat-footnote">Based on your current workspace. History stays in this session.</div>
    </section>
  </>;
}

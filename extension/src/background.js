import { collectD2L } from './d2l-collect.js';
import { toImportPayload } from './to-classsync.js';
import { signIn, getAccessToken, sendPreview } from './classsync-api.js';

const SYNC_EVERY_MINUTES = 60;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('sync', { periodInMinutes: SYNC_EVERY_MINUTES });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'sync') runSync().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const handlers = {
    'sync-now': () => runSync(),
    'sign-in': async () => {
      const { settings } = await chrome.storage.local.get('settings');
      const session = await signIn(settings, message.email, message.password);
      await chrome.storage.local.set({ session });
      return { email: session.email };
    },
    'sign-out': () => chrome.storage.local.remove('session'),
  };
  const handler = handlers[message.type];
  if (!handler) return false;
  Promise.resolve(handler())
    .then(result => reply({ ok: true, result }))
    .catch(err => reply({ ok: false, error: err.message }));
  return true; // keeps the channel open for the async reply
});

let running = null;
function runSync() {
  running ??= doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings?.d2lOrigin) return saveStatus({ state: 'not_configured', message: 'Open settings to add your D2L address.' });

  const origins = [settings.d2lOrigin, settings.appUrl, settings.supabaseUrl].filter(Boolean).map(o => `${o}/*`);
  if (!(await chrome.permissions.contains({ origins }))) {
    return saveStatus({ state: 'needs_permission', message: 'Open settings and click Save to grant access.' });
  }

  await saveStatus({ state: 'running', message: 'Reading D2L…' });
  const collected = await collectFromD2L(settings.d2lOrigin);
  if (!collected.ok) {
    const message = collected.code === 'needs_login' ? 'Sign in to D2L, then sync again.' : collected.error;
    return saveStatus({ state: collected.code === 'needs_login' ? 'needs_login' : 'error', message });
  }

  const { payload, warnings } = toImportPayload(collected.data);
  await chrome.storage.local.set({ lastPayload: payload });
  const counts = {
    courses: payload.data.courses.length,
    assignments: payload.data.assignments.length,
    materials: payload.data.materials.length,
  };

  if (!settings.appUrl || !settings.supabaseUrl) {
    return saveStatus({ state: 'ok', message: 'Read D2L. Not sent: ClassSync isn\'t set up in settings.', counts, warnings });
  }
  const token = await getAccessToken(settings);
  if (!token) return saveStatus({ state: 'needs_classsync_login', message: 'Read D2L. Sign in to ClassSync in settings to send it.', counts, warnings });

  try {
    await sendPreview(settings, token, payload);
    return saveStatus({ state: 'ok', message: 'Sent to ClassSync for review.', counts, warnings });
  } catch (err) {
    return saveStatus({ state: 'error', message: `Read D2L, but sending failed: ${err.message}`, counts, warnings });
  }
}

// Prefer an open D2L tab: requests from inside the page are same-origin, so the
// D2L session cookie is always included. Without one, call D2L from here.
async function collectFromD2L(origin) {
  const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
  if (tab?.id != null) {
    try {
      const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectD2L, args: [origin] });
      if (injection?.result) return injection.result;
    } catch {
      // tab closed or navigated away mid-sync; fall through
    }
  }
  return collectD2L(origin);
}

async function saveStatus(status) {
  const full = { ...status, at: new Date().toISOString() };
  await chrome.storage.local.set({ status: full });
  const badge = { needs_login: '!', needs_classsync_login: '!', needs_permission: '!', error: '×' }[status.state] ?? '';
  await chrome.action.setBadgeText({ text: badge });
  await chrome.action.setBadgeBackgroundColor({ color: status.state === 'error' ? '#b42318' : '#b54708' });
  return full;
}

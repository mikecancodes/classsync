import { collectD2L } from './d2l-collect.js';
import { toImportPayload } from './to-classsync.js';
import { isSignedInD2LPage } from './d2l-pages.js';

// Connect flow: ClassSync page → bridge → "connect" → connect.html asks for access →
// D2L sign-in tab → when /d2l/home loads, read D2L → hand the import to ClassSync tabs.

const sitePatterns = () => chrome.runtime.getManifest().content_scripts?.[0]?.matches ?? [];
const BRIDGE_FILES = ['src/bridge-protocol.js', 'src/classsync-bridge.js'];

// Chrome only runs manifest content scripts on pages loaded after install, so add the bridge
// to ClassSync tabs that are already open; the page then notices the extension without a refresh
chrome.runtime.onInstalled.addListener(async () => {
  for (const tab of await siteTabs()) {
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: BRIDGE_FILES }); } catch { /* tab can't be scripted */ }
  }
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const handlers = {
    // From the ClassSync page (through classsync-bridge.js)
    'bridge-hello': () => { rememberSite(sender); return helloState(); },
    'bridge-connect': () => startConnect(message, sender),
    'bridge-sync-now': () => startSync(),
    'bridge-get-import': async () => {
      const { pendingImport } = await chrome.storage.local.get('pendingImport');
      return pendingImport ? { payload: pendingImport.payload, school: pendingImport.school } : {};
    },
    'bridge-import-applied': () => clearImport('Added to ClassSync.'),
    'bridge-import-dismissed': () => clearImport('Import dismissed. Sync again any time.'),
    // From connect.html after the student approved access
    'connect-granted': () => finishConnect(message),
    // From the popup
    'sync-now': () => startSync(),
  };
  const handler = handlers[message?.type];
  if (!handler) return false;
  Promise.resolve(handler())
    .then(result => reply(result ?? { ok: true }))
    .catch(err => reply({ error: err.message }));
  return true; // keeps the channel open for the async reply
});

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return settings;
}

async function isConnected(settings) {
  return Boolean(settings.d2lOrigin) && chrome.permissions.contains({ origins: [`${settings.d2lOrigin}/*`] });
}

async function helloState() {
  const settings = await getSettings();
  const { pendingImport } = await chrome.storage.local.get('pendingImport');
  return {
    version: chrome.runtime.getManifest().version,
    connected: await isConnected(settings),
    school: settings.schoolName ?? null,
    d2lOrigin: settings.d2lOrigin ?? null,
    hasPendingImport: Boolean(pendingImport),
  };
}

// Remember which ClassSync address the student uses, to bring them back after D2L sign-in
async function rememberSite(sender) {
  if (sender.url) await chrome.storage.local.set({ siteOrigin: new URL(sender.url).origin });
}

async function startConnect(message, sender) {
  await rememberSite(sender);
  const params = new URLSearchParams({ d2l: message.d2lOrigin, name: message.schoolName });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`connect.html?${params}`) });
  await notifyPages('status', { message: 'Approve access in the tab that just opened.', state: 'running' });
}

async function finishConnect(message) {
  if (!(await chrome.permissions.contains({ origins: [`${message.d2lOrigin}/*`] }))) throw new Error('Access to D2L was not granted.');
  await chrome.storage.local.set({ settings: { d2lOrigin: message.d2lOrigin, schoolName: message.schoolName }, awaitingLogin: true });
  await openD2L(message.d2lOrigin);
  await notifyPages('status', { message: `Sign in to ${message.schoolName} D2L in the tab that opened. Your classes will show up here afterwards.`, state: 'running', connected: true, school: message.schoolName });
}

async function openD2L(origin) {
  const [existing] = await chrome.tabs.query({ url: `${origin}/*` });
  if (existing?.id != null) await chrome.tabs.update(existing.id, { active: true, url: `${origin}/d2l/home` });
  else await chrome.tabs.create({ url: `${origin}/d2l/home` });
}

// After connecting (or when a sync needed a fresh sign-in), sync once a signed-in D2L page loads
chrome.tabs.onUpdated.addListener(async (_tabId, change, tab) => {
  if (change.status !== 'complete' || !tab.url) return;
  const { awaitingLogin } = await chrome.storage.local.get('awaitingLogin');
  if (!awaitingLogin) return;
  const settings = await getSettings();
  if (!settings.d2lOrigin) return;
  const url = new URL(tab.url);
  if (isSignedInD2LPage(url, settings.d2lOrigin)) {
    await chrome.storage.local.set({ awaitingLogin: false });
    startSync();
  }
});

async function startSync() {
  const settings = await getSettings();
  if (!(await isConnected(settings))) throw new Error('Connect your school first.');
  runSync(settings); // progress is reported through notifyPages
  return { ok: true };
}

let running = null;
function runSync(settings) {
  running ??= doSync(settings).finally(() => { running = null; });
  return running;
}

async function doSync(settings) {
  // Bring the student back to ClassSync right away, where progress and the review appear
  if (!(await focusSite())) await openSite();
  await saveStatus({ state: 'running', message: `Reading your classes from ${settings.schoolName} D2L…` });
  const collected = await collectFromD2L(settings.d2lOrigin);
  if (!collected.ok) {
    if (collected.code === 'needs_login') {
      await chrome.storage.local.set({ awaitingLogin: true });
      await openD2L(settings.d2lOrigin);
      return saveStatus({ state: 'needs_login', message: `Sign in to ${settings.schoolName} D2L in the tab that opened, and sync will continue.` });
    }
    return saveStatus({ state: 'error', message: `Couldn't read D2L: ${collected.error}` });
  }

  const { payload, warnings } = toImportPayload(collected.data);
  await chrome.storage.local.set({ pendingImport: { payload, school: settings.schoolName, at: new Date().toISOString() }, lastPayload: payload });
  const counts = { courses: payload.data.courses.length, assignments: payload.data.assignments.length, announcements: payload.data.announcements.length };
  await saveStatus({ state: 'ready', message: 'Review your classes in ClassSync.', counts, warnings });
  // A tab still loading misses this; its bridge reports the pending import when it says hello
  if (await notifyPages('import-ready', {})) await focusSite();
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

async function clearImport(message) {
  await chrome.storage.local.remove('pendingImport');
  await saveStatus({ state: 'ok', message });
}

async function siteTabs() {
  const patterns = sitePatterns();
  return patterns.length ? chrome.tabs.query({ url: patterns }) : [];
}

// Sends to every open ClassSync tab; returns how many received it
async function notifyPages(type, data) {
  let delivered = 0;
  for (const tab of await siteTabs()) {
    try { await chrome.tabs.sendMessage(tab.id, { target: 'classsync-page', type, data }); delivered++; } catch { /* tab still loading */ }
  }
  return delivered;
}

async function focusSite() {
  const [tab] = await siteTabs();
  if (tab?.id == null) return false;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
  return true;
}

// No ClassSync tab open: open it; the bridge's hello reports the pending import on load
async function openSite() {
  const { siteOrigin } = await chrome.storage.local.get('siteOrigin');
  const fallback = sitePatterns()[0]?.replace('/*', '');
  if (siteOrigin || fallback) await chrome.tabs.create({ url: `${siteOrigin || fallback}/`, active: true });
}

async function saveStatus(status) {
  const full = { ...status, at: new Date().toISOString() };
  await chrome.storage.local.set({ status: full });
  const badge = { needs_login: '!', error: '×', ready: '1' }[status.state] ?? '';
  await chrome.action.setBadgeText({ text: badge });
  await chrome.action.setBadgeBackgroundColor({ color: status.state === 'error' ? '#b42318' : status.state === 'ready' ? '#4f46e5' : '#b54708' });
  await notifyPages('status', { message: status.message, state: status.state });
  return full;
}

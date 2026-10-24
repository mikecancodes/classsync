const settingsForm = document.getElementById('settings');
const signinForm = document.getElementById('signin');
const show = (id, text, isError = false) => {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.toggle('error', isError);
};

// Accepts "d2l.school.edu/d2l/home" and returns "https://d2l.school.edu".
// Plain http is only allowed for a ClassSync app running on this computer.
function toOrigin(value, { allowLocalHttp = false } = {}) {
  if (!value.trim()) return '';
  const url = new URL(/^https?:\/\//.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocalHttp && isLocal)) throw new Error(`${url.origin} must use https.`);
  return url.origin;
}

async function load() {
  const { settings = {}, session } = await chrome.storage.local.get(['settings', 'session']);
  for (const [name, value] of Object.entries(settings)) {
    if (settingsForm.elements[name]) settingsForm.elements[name].value = value;
  }
  document.getElementById('signed-in-as').textContent = session ? `Signed in as ${session.email}.` : 'Not signed in.';
}

settingsForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = settingsForm.elements;
  try {
    const settings = {
      d2lOrigin: toOrigin(form.d2lOrigin.value),
      appUrl: toOrigin(form.appUrl.value, { allowLocalHttp: true }),
      supabaseUrl: toOrigin(form.supabaseUrl.value),
      supabaseAnonKey: form.supabaseAnonKey.value.trim(),
    };
    // Ask only for the exact sites we need, not every website.
    // Must run from this click, because Chrome only shows the prompt after a user action.
    const origins = [settings.d2lOrigin, settings.appUrl, settings.supabaseUrl].filter(Boolean).map(o => `${o}/*`);
    const granted = await chrome.permissions.request({ origins });
    if (!granted) return show('settings-status', 'Access not granted. ClassSync can\'t read D2L without it.', true);
    await chrome.storage.local.set({ settings });
    show('settings-status', 'Saved.');
  } catch (err) {
    show('settings-status', err.message, true);
  }
});

signinForm.addEventListener('submit', async event => {
  event.preventDefault();
  const { email, password } = signinForm.elements;
  show('signin-status', 'Signing in…');
  const reply = await chrome.runtime.sendMessage({ type: 'sign-in', email: email.value, password: password.value });
  password.value = '';
  if (!reply.ok) return show('signin-status', reply.error, true);
  show('signin-status', 'Signed in.');
  load();
});

document.getElementById('signout').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'sign-out' });
  show('signin-status', 'Signed out.');
  load();
});

load();

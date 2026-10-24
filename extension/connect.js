// Opened by the background with ?d2l=<https origin>&name=<school>. Chrome only shows the
// permission prompt after a click on an extension page, which is why this page exists.
const params = new URLSearchParams(location.search);
const status = document.getElementById('status');
const allow = document.getElementById('allow');
const show = (text, isError = false) => { status.textContent = text; status.classList.toggle('error', isError); };

function parseOrigin(value) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && url.origin === value ? url.origin : null;
  } catch { return null; }
}

const origin = parseOrigin(params.get('d2l'));
const schoolName = (params.get('name') || (origin ? new URL(origin).hostname : '')).slice(0, 100);
document.getElementById('school').textContent = schoolName || 'your school';
document.getElementById('origin').textContent = origin ?? '(missing address)';
if (!origin) { allow.disabled = true; show('This link is missing a valid D2L address. Start again from ClassSync.', true); }

// Every Brightspace site answers this without signing in
async function looksLikeD2L() {
  try {
    const res = await fetch(`${origin}/d2l/api/versions/`, { headers: { Accept: 'application/json' } });
    const versions = await res.json();
    return Array.isArray(versions) && versions.some(v => v.ProductCode === 'lp') && versions.some(v => v.ProductCode === 'le');
  } catch { return false; }
}

allow.addEventListener('click', async () => {
  allow.disabled = true;
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) { allow.disabled = false; return show('Access wasn’t granted. ClassSync can’t read D2L without it.', true); }
  show('Checking that this is a D2L site…');
  if (!(await looksLikeD2L())) {
    await chrome.permissions.remove({ origins: [`${origin}/*`] });
    allow.disabled = false;
    return show(`${origin} didn’t respond like a D2L site. Check the address in ClassSync and try again.`, true);
  }
  const reply = await chrome.runtime.sendMessage({ type: 'connect-granted', d2lOrigin: origin, schoolName });
  if (reply?.error) { allow.disabled = false; return show(reply.error, true); }
  show(`Connected. Sign in to ${schoolName} D2L in the tab that opened; your classes will appear in ClassSync. You can close this tab.`);
});

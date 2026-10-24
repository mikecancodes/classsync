const syncButton = document.getElementById('sync');

function render(status) {
  const message = document.getElementById('message');
  message.textContent = status?.message ?? 'Not synced yet. Use Connect your school in ClassSync to start.';
  message.classList.toggle('error', ['error', 'needs_login'].includes(status?.state));
  syncButton.disabled = status?.state === 'running';

  const parts = [];
  if (status?.counts) parts.push(`${status.counts.courses} classes · ${status.counts.assignments} assignments · ${status.counts.announcements} announcements`);
  if (status?.at) parts.push(`Last update ${new Date(status.at).toLocaleString()}`);
  document.getElementById('details').textContent = parts.join(' — ');

  const list = document.getElementById('warnings');
  list.replaceChildren(...(status?.warnings ?? []).slice(0, 5).map(text => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
}

syncButton.addEventListener('click', async () => {
  const reply = await chrome.runtime.sendMessage({ type: 'sync-now' });
  if (reply?.error) render({ state: 'error', message: reply.error });
});

document.getElementById('open-site').addEventListener('click', async () => {
  const { siteOrigin } = await chrome.storage.local.get('siteOrigin');
  const fallback = chrome.runtime.getManifest().content_scripts?.[0]?.matches?.[0]?.replace('/*', '');
  chrome.tabs.create({ url: `${siteOrigin || fallback}/` });
});

// For checking what D2L returned at a new school; same data the review screen uses
document.getElementById('download').addEventListener('click', async event => {
  event.preventDefault();
  const { lastPayload } = await chrome.storage.local.get('lastPayload');
  if (!lastPayload) return render({ state: 'error', message: 'Nothing to download yet. Sync first.' });
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastPayload, null, 2)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `classsync-d2l-${new Date().toISOString().slice(0, 10)}.json` });
  link.click();
  URL.revokeObjectURL(url);
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.status) render(changes.status.newValue);
});

chrome.storage.local.get('status').then(({ status }) => render(status));

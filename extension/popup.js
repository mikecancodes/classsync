const syncButton = document.getElementById('sync');

function render(status) {
  const message = document.getElementById('message');
  message.textContent = status?.message ?? 'Not synced yet.';
  message.classList.toggle('error', ['error', 'needs_login', 'needs_classsync_login', 'needs_permission'].includes(status?.state));
  syncButton.disabled = status?.state === 'running';

  const parts = [];
  if (status?.counts) parts.push(`${status.counts.courses} courses · ${status.counts.assignments} assignments · ${status.counts.materials} announcements`);
  if (status?.at) parts.push(`Last run ${new Date(status.at).toLocaleString()}`);
  document.getElementById('details').textContent = parts.join(' — ');

  const list = document.getElementById('warnings');
  list.replaceChildren(...(status?.warnings ?? []).slice(0, 5).map(text => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
}

syncButton.addEventListener('click', async () => {
  render({ state: 'running', message: 'Syncing…' });
  await chrome.runtime.sendMessage({ type: 'sync-now' });
});

// The file is the same payload sent to /api/imports/preview
document.getElementById('download').addEventListener('click', async () => {
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

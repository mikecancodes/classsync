const connection = document.getElementById('connection');

async function render() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const granted = settings.d2lOrigin && await chrome.permissions.contains({ origins: [`${settings.d2lOrigin}/*`] });
  connection.textContent = granted ? `Connected to ${settings.schoolName} D2L (${settings.d2lOrigin}).` : 'Not connected to a school yet.';
  document.getElementById('disconnect').disabled = !settings.d2lOrigin;
}

document.getElementById('open-site').addEventListener('click', async () => {
  const { siteOrigin } = await chrome.storage.local.get('siteOrigin');
  const fallback = chrome.runtime.getManifest().content_scripts?.[0]?.matches?.[0]?.replace('/*', '');
  chrome.tabs.create({ url: `${siteOrigin || fallback}/connect` });
});

// Removes the saved school, D2L access and any unreviewed import
document.getElementById('disconnect').addEventListener('click', async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (settings.d2lOrigin) await chrome.permissions.remove({ origins: [`${settings.d2lOrigin}/*`] });
  await chrome.storage.local.remove(['settings', 'pendingImport', 'lastPayload', 'awaitingLogin', 'status']);
  await chrome.action.setBadgeText({ text: '' });
  render();
});

render();

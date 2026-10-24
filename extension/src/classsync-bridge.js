// Runs only on the ClassSync site (see manifest). Relays a few allowed messages between
// the page and the extension's background worker. It never reads D2L itself.
(() => {
  // Injected again after install/update; skip if a bridge from the running extension exists.
  // A bridge left over from before an update is dead (no runtime id) and removes itself.
  if (globalThis.__classsyncBridgeAlive?.()) return;
  globalThis.__classsyncBridgeAlive = () => Boolean(chrome.runtime?.id);

  const { parsePageMessage } = globalThis.ClassSyncBridgeProtocol;
  const toPage = (type, data = {}) => window.postMessage({ ...data, source: 'classsync-extension', type }, window.location.origin);

  async function toBackground(message) {
    if (chrome.runtime?.id) {
      try { return await chrome.runtime.sendMessage(message); } catch { /* fall through */ }
    }
    if (!chrome.runtime?.id) window.removeEventListener('message', onPageMessage);
    return null;
  }

  async function hello() {
    const reply = await toBackground({ type: 'bridge-hello' });
    if (reply && !reply.error) toPage('hello', reply);
  }

  async function onPageMessage(event) {
    const message = parsePageMessage(event, window);
    if (!message) return;
    if (message.type === 'ping') return hello();
    const reply = await toBackground({ ...message, type: `bridge-${message.type}` });
    if (reply?.error) toPage('status', { message: reply.error, state: 'error' });
    else if (message.type === 'get-import' && reply?.payload) toPage('import', { payload: reply.payload, school: reply.school });
  }
  window.addEventListener('message', onPageMessage);

  // Background → page: progress updates and "an import is ready"
  chrome.runtime.onMessage.addListener(message => {
    if (message?.target === 'classsync-page' && typeof message.type === 'string') toPage(message.type, message.data ?? {});
  });

  hello();
})();

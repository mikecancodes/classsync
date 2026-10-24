// Runs only on the ClassSync site (see manifest). Relays a few allowed messages between
// the page and the extension's background worker. It never reads D2L itself.
(() => {
  const { parsePageMessage } = globalThis.ClassSyncBridgeProtocol;
  const toPage = (type, data = {}) => window.postMessage({ ...data, source: 'classsync-extension', type }, window.location.origin);

  async function toBackground(message) {
    try { return await chrome.runtime.sendMessage(message); }
    catch { return { error: 'The ClassSync extension was updated. Reload this page.' }; }
  }

  async function hello() {
    const reply = await toBackground({ type: 'bridge-hello' });
    if (reply && !reply.error) toPage('hello', reply);
  }

  window.addEventListener('message', async event => {
    const message = parsePageMessage(event, window);
    if (!message) return;
    if (message.type === 'ping') return hello();
    const reply = await toBackground({ ...message, type: `bridge-${message.type}` });
    if (reply?.error) toPage('status', { message: reply.error, state: 'error' });
    else if (message.type === 'get-import' && reply?.payload) toPage('import', { payload: reply.payload, school: reply.school });
  });

  // Background → page: progress updates and "an import is ready"
  chrome.runtime.onMessage.addListener(message => {
    if (message?.target === 'classsync-page' && typeof message.type === 'string') toPage(message.type, message.data ?? {});
  });

  hello();
})();

// Which messages the ClassSync page may send the extension, and how they're checked.
// A plain script, not a module: manifest content scripts can't import, so this file is
// listed before classsync-bridge.js and shares its scope. Tests load it the same way.
(() => {
  const PAGE_TYPES = ['ping', 'connect', 'sync-now', 'get-import', 'import-applied', 'import-dismissed'];

  // Returns a clean message, or null for anything not from this page or not allowed
  function parsePageMessage(event, win) {
    if (event.source !== win || event.origin !== win.location.origin) return null;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.source !== 'classsync-app' || !PAGE_TYPES.includes(data.type)) return null;
    if (data.type !== 'connect') return { type: data.type };
    if (typeof data.d2lOrigin !== 'string' || data.d2lOrigin.length > 300) return null;
    let url;
    try { url = new URL(data.d2lOrigin); } catch { return null; }
    // Only a bare https origin; the user still has to approve access in Chrome's prompt
    if (url.protocol !== 'https:' || url.origin !== data.d2lOrigin) return null;
    const schoolName = typeof data.schoolName === 'string' && data.schoolName.trim() ? data.schoolName.trim().slice(0, 100) : url.hostname;
    return { type: 'connect', d2lOrigin: url.origin, schoolName };
  }

  globalThis.ClassSyncBridgeProtocol = { PAGE_TYPES, parsePageMessage };
})();

'use client';

import { useCallback, useEffect, useState } from 'react';

// Messages between the ClassSync page and the D2L extension's bridge content script
// (extension/src/classsync-bridge.js). Both sides only accept same-window, same-origin
// messages tagged with the other side's source.

const APP_SOURCE = 'classsync-app';
const EXTENSION_SOURCE = 'classsync-extension';

export type AppMessageType = 'ping' | 'connect' | 'sync-now' | 'get-import' | 'import-applied' | 'import-dismissed';
type ExtensionMessage = { source: typeof EXTENSION_SOURCE; type: string; [key: string]: unknown };

export function sendToExtension(type: AppMessageType, data: Record<string, unknown> = {}) {
  window.postMessage({ ...data, source: APP_SOURCE, type }, window.location.origin);
}

export function onExtensionMessage(handler: (message: ExtensionMessage) => void) {
  const listener = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.source !== EXTENSION_SOURCE || typeof data.type !== 'string') return;
    handler(data as ExtensionMessage);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export type ExtensionState = {
  checked: boolean;
  installed: boolean;
  version?: string;
  connected: boolean;
  school: string | null;
  d2lOrigin: string | null;
  progress: string;
  progressState: string;
  pendingImport: { payload: unknown; school: string | null } | null;
};

const initial: ExtensionState = { checked: false, installed: false, connected: false, school: null, d2lOrigin: null, progress: '', progressState: '', pendingImport: null };

// One instance lives in the app shell and is passed down, so there is a single listener
export function useExtension() {
  const [state, setState] = useState<ExtensionState>(initial);

  useEffect(() => onExtensionMessage(message => {
    if (message.type === 'hello') {
      setState(current => ({
        ...current,
        checked: true,
        installed: true,
        version: typeof message.version === 'string' ? message.version : undefined,
        connected: message.connected === true,
        school: typeof message.school === 'string' ? message.school : null,
        d2lOrigin: typeof message.d2lOrigin === 'string' ? message.d2lOrigin : null,
      }));
      if (message.hasPendingImport === true) sendToExtension('get-import');
    } else if (message.type === 'status') {
      setState(current => ({
        ...current,
        progress: typeof message.message === 'string' ? message.message : '',
        progressState: typeof message.state === 'string' ? message.state : '',
        connected: typeof message.connected === 'boolean' ? message.connected : current.connected,
        school: typeof message.school === 'string' ? message.school : current.school,
      }));
    } else if (message.type === 'import-ready') {
      sendToExtension('get-import');
    } else if (message.type === 'import' && message.payload) {
      setState(current => ({ ...current, pendingImport: { payload: message.payload, school: typeof message.school === 'string' ? message.school : null } }));
    }
  }), []);

  // Ping until the extension answers, so the page notices an install without a reload
  useEffect(() => {
    if (state.installed) return;
    sendToExtension('ping');
    const checked = setTimeout(() => setState(current => ({ ...current, checked: true })), 1500);
    const poll = setInterval(() => sendToExtension('ping'), 2000);
    return () => { clearTimeout(checked); clearInterval(poll); };
  }, [state.installed]);

  const clearImport = useCallback((applied: boolean) => {
    sendToExtension(applied ? 'import-applied' : 'import-dismissed');
    setState(current => ({ ...current, pendingImport: null }));
  }, []);

  return { ...state, send: sendToExtension, clearImport };
}

export type ExtensionHandle = ReturnType<typeof useExtension>;

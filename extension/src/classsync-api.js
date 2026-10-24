// Talks to Supabase Auth (to sign in) and to the ClassSync app (to send the import).
// Uses Supabase's REST endpoints directly so the extension needs no build step.
// The password is never stored; only the session tokens are, in chrome.storage.local.

async function authRequest(settings, grantType, body) {
  const res = await fetch(`${settings.supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
    method: 'POST',
    headers: { apikey: settings.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.msg || `Sign-in failed (${res.status}).`);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    email: json.user?.email ?? '',
  };
}

export const signIn = (settings, email, password) => authRequest(settings, 'password', { email, password });

// Returns a valid access token, refreshing it if it expires within a minute.
// Returns null (and clears the session) if the user needs to sign in again.
export async function getAccessToken(settings) {
  const { session } = await chrome.storage.local.get('session');
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60_000) return session.accessToken;
  try {
    const fresh = await authRequest(settings, 'refresh_token', { refresh_token: session.refreshToken });
    await chrome.storage.local.set({ session: fresh });
    return fresh.accessToken;
  } catch {
    await chrome.storage.local.remove('session');
    return null;
  }
}

export async function sendPreview(settings, accessToken, payload) {
  const res = await fetch(`${settings.appUrl}/api/imports/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `ClassSync returned ${res.status}.`);
  return json;
}

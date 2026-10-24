// Any signed-in D2L page counts, so a sync starts whichever page a school's sign-in lands on.
// Login, logout and SSO hand-off pages don't.
export function isSignedInD2LPage(url, d2lOrigin) {
  return url.origin === d2lOrigin && url.pathname.startsWith('/d2l/') && !/\/(login|logout|auth)(\/|$|\.)/i.test(url.pathname);
}

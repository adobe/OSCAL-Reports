/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
// Never attach OAuth credentials to the session object: middleware exposes it as req.user.
// ponytail: process-local, like OSCAL sessions; restart requires sign-in. Use an encrypted
// shared session/token store together if multi-instance session continuity is required.
const tokens = new WeakMap();

export function retainDelegatedToken(session, token, expiresAt) {
  if (!session || typeof token !== 'string' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) { return; }
  revokeDelegatedToken(session);
  const timer = setTimeout(() => tokens.delete(session), expiresAt - Date.now());
  timer.unref();
  tokens.set(session, { token, expiresAt, timer });
}

export function getDelegatedToken(session) {
  const entry = session && tokens.get(session);
  if (!entry || entry.expiresAt <= Date.now()) {
    revokeDelegatedToken(session);
    return null;
  }
  return entry.token;
}

export function revokeDelegatedToken(session) {
  if (!session) { return; }
  const entry = tokens.get(session);
  if (entry) { clearTimeout(entry.timer); }
  tokens.delete(session);
}
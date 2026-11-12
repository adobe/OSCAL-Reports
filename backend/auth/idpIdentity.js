/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
// Server-side record of how a session was authenticated. Kept off the session object because
// middleware exposes that object as req.user; groups come from the IdP token exchange, never the browser.
const identities = new WeakMap();

export function recordIdpIdentity(session, { provider, groups }) {
  if (!session || typeof provider !== 'string') { return; }
  identities.set(session, {
    provider,
    groups: Array.isArray(groups) ? groups.map(group => String(group).trim()).filter(Boolean) : [],
  });
}

export const getIdpIdentity = session => (session && identities.get(session)) || null;

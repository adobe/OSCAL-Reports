/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
async function transaction(userId, mode, action) {
  if (!userId || !window.indexedDB) { throw new Error('Signed-in browser revision storage is unavailable.'); }
  const db = await new Promise((resolve, reject) => {
    const request = window.indexedDB.open('oscal-guardian-revisions', 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('revisions');
    request.onsuccess = () => { if (blocked) { request.result.close(); } else { resolve(request.result); } };
    request.onerror = () => reject(new Error('Guardian revision storage could not be opened.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close other OSCAL tabs before opening Guardian revision storage.'));
    };
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('revisions', mode);
      const request = action(tx.objectStore('revisions'), String(userId));
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onabort = tx.onerror = () => reject(new Error('Guardian revision could not be saved or loaded. Check browser storage capacity.'));
    });
  } finally {
    db.close();
  }
}

export const loadGuardianRevision = userId => transaction(userId, 'readonly', (store, key) => store.get(key));
export const saveGuardianRevision = (userId, revision) =>
  transaction(userId, 'readwrite', (store, key) => store.put(revision, key));

const pad = value => String(value).padStart(2, '0');

const NAME_PREFIX_LENGTH = 16;

// <first 16 characters of the input file name>_GAD-Input_<local date and time as digits>.json
export function guardianDownloadName(inputName, now = new Date()) {
  const base = String(inputName || '').replace(/\.json$/i, '').split('')
    .map(char => (char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? '_' : char)).join('').slice(0, NAME_PREFIX_LENGTH) || 'report';
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${base}_GAD-Input_${stamp}.json`;
}

// Accès réseau : un seul téléchargement par URL (dédoublonnage des requêtes
// en cours) + cache mémoire. Les fichiers /data sont aussi gardés par le
// service worker, donc disponibles hors ligne après la première visite.
const cache = new Map();

export function getJSON(url, { ttl = Infinity, signal } = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < ttl) return hit.promise;

  const promise = fetch(url, { signal }).then(async (r) => {
    if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: r.status });
    const type = r.headers.get('content-type') || '';
    if (!type.includes('json')) throw Object.assign(new Error('not json'), { status: 404 });
    return r.json();
  });
  const entry = { promise, time: Date.now() };
  cache.set(url, entry);
  // Un échec (ou une requête annulée) ne doit pas rester en cache.
  promise.catch(() => { if (cache.get(url) === entry) cache.delete(url); });
  return promise;
}

// Minuscules, sans accents, sans ponctuation : « Paracétamol 1 000 mg » → « paracetamol 1 000 mg »
export const normalize = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Lance une tâche quand le navigateur est au repos (sans bloquer l'affichage).
export const whenIdle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 600));

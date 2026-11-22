// Outils communs aux fonctions /api.

export const UA = { 'User-Agent': 'Pharmascan/1.0 (application sante grand public)' };

// Cache à deux étages : le navigateur garde `browser` secondes, le CDN Vercel
// garde `cdn` secondes puis sert l'ancienne réponse pendant qu'il la rafraîchit
// (stale-while-revalidate). Résultat : la plupart des requêtes ne réveillent
// plus aucune fonction.
export function cache(res, { browser = 3600, cdn = 86400, swr = 604800 } = {}) {
  res.setHeader('Cache-Control', `public, max-age=${browser}, s-maxage=${cdn}, stale-while-revalidate=${swr}`);
}

export function preflight(req, res, methods = 'GET, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

// fetch JSON avec délai maximal ; renvoie null en cas d'échec (jamais d'exception).
export async function fetchJson(url, { timeout = 6000, ...opts } = {}) {
  try {
    const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/* Autocomplétion des communes — secours.
   Le site interroge directement la Géoplateforme IGN depuis le navigateur ;
   cette route ne sert que si cet appel direct est bloqué. */
import { cache, preflight, fetchJson } from './_lib/http.js';

const GEOCODE = 'https://data.geopf.fr/geocodage/search';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  const q = String(req.query.q || '').slice(0, 80);
  if (q.trim().length < 2) return res.status(200).json([]);

  const data = await fetchJson(`${GEOCODE}?q=${encodeURIComponent(q)}&type=municipality&autocomplete=1&limit=7`);
  const villes = ((data && data.features) || []).map((f) => {
    const c = (f.geometry && f.geometry.coordinates) || [];
    const p = f.properties || {};
    return { nom: p.city || p.name || p.label, cp: p.postcode || '', insee: p.citycode || '', lat: c[1], lon: c[0] };
  }).filter((v) => v.nom);

  if (data) cache(res); else res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(villes);
}

import { cache, preflight, UA } from './_lib/http.js';

/* Recherche de pharmacies — SECOURS uniquement.
   Le site cherche d'abord dans sa base embarquée (public/data/pharmacies),
   instantanée. Cette route ne sert que pour Monaco (hors base tant que
   `npm run build:pharmacies` n'a pas été relancé) ou si la base locale
   est inaccessible. 2 sources :
   1. Overpass (OpenStreetMap) : par commune entière (code INSEE) ou par rayon.
      3 miroirs essayés successivement.
   2. Nominatim (OpenStreetMap) en secours si tous les miroirs Overpass échouent.
   Couvre ainsi toutes les communes de France. */

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];


function mapElements(data) {
  return (data.elements || []).map((el) => {
    const t = el.tags || {};
    const plat = el.lat != null ? el.lat : el.center && el.center.lat;
    const plon = el.lon != null ? el.lon : el.center && el.center.lon;
    const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    return { name: t.name || 'Pharmacie', addr, phone: t.phone || t['contact:phone'] || '', lat: plat, lon: plon };
  }).filter((p) => p.lat != null && p.lon != null);
}

async function queryOverpass(q) {
  for (const ep of OVERPASS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...UA },
        body: 'data=' + encodeURIComponent(q),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) continue;
      const data = await r.json();
      if (data && Array.isArray(data.elements)) return data;
    } catch (e) { /* essaie le miroir suivant */ }
  }
  return null;
}

// Secours : recherche Nominatim par nom de ville (moins riche mais très fiable)
async function queryNominatim(ville) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&amenity=pharmacy&city=${encodeURIComponent(ville)}&countrycodes=fr&limit=50`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const r = await fetch(url, { headers: UA, signal: controller.signal });
  clearTimeout(timer);
  if (!r.ok) throw new Error('nominatim ' + r.status);
  const data = await r.json();
  return (Array.isArray(data) ? data : []).map((d) => {
    const parts = (d.display_name || '').split(',').map((s) => s.trim());
    return {
      name: parts[0] || 'Pharmacie',
      addr: parts.slice(1, 3).join(', '),
      phone: '',
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
    };
  }).filter((p) => !isNaN(p.lat) && !isNaN(p.lon));
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;

  const { insee, ville } = req.query;
  // Coordonnées validées (elles sont insérées dans la requête Overpass)
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  const hasPoint = req.query.lat && req.query.lon && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

  let q = null;
  if (insee && /^\d[0-9AB]\d{3}$/i.test(insee)) {
    // Mode commune : TOUTES les pharmacies de la commune (code INSEE officiel)
    q = `[out:json][timeout:8];area["ref:INSEE"="${insee.toUpperCase()}"]->.a;(node["amenity"="pharmacy"](area.a);way["amenity"="pharmacy"](area.a););out center;`;
  } else if (hasPoint) {
    // Mode rayon : autour d'un point (fallback villages)
    const radius = Math.min(Math.max(parseInt(req.query.radius, 10) || 5000, 1000), 30000);
    q = `[out:json][timeout:8];(node["amenity"="pharmacy"](around:${radius},${lat},${lon});way["amenity"="pharmacy"](around:${radius},${lat},${lon}););out center;`;
  } else {
    return res.status(400).json({ error: 'insee ou lat/lon requis' });
  }

  const data = await queryOverpass(q);
  if (data) { cache(res, { cdn: 604800 }); return res.status(200).json(mapElements(data)); }

  // Overpass entièrement en panne → secours Nominatim par nom de ville
  if (ville) {
    try {
      const list = await queryNominatim(ville);
      if (list.length > 0) { cache(res, { cdn: 86400 }); return res.status(200).json(list); }
    } catch (e) { /* tant pis */ }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(502).json({ error: 'Sources cartographiques momentanément indisponibles' });
}

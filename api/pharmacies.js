const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
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
      const timer = setTimeout(() => controller.abort(), 20000);
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) continue;
      return await r.json();
    } catch (e) { /* essaie le miroir suivant */ }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lon, insee } = req.query;

  // Mode commune : toutes les pharmacies de la commune (code INSEE officiel).
  // C'est le mode principal — "Reims" retourne TOUTES les pharmacies de Reims.
  if (insee && /^\d[0-9AB]\d{3}$/i.test(insee)) {
    const q = `[out:json][timeout:15];area["ref:INSEE"="${insee.toUpperCase()}"]->.a;(node["amenity"="pharmacy"](area.a);way["amenity"="pharmacy"](area.a););out center;`;
    const data = await queryOverpass(q);
    if (data) return res.status(200).json(mapElements(data));
    // pas de réponse Overpass → on laisse le client basculer en mode rayon
    return res.status(502).json({ error: 'Overpass indisponible' });
  }

  // Mode rayon : pharmacies autour d'un point (villages sans pharmacie, fallback).
  if (!lat || !lon) return res.status(400).json({ error: 'insee ou lat/lon requis' });
  const radius = Math.min(Math.max(parseInt(req.query.radius, 10) || 5000, 1000), 30000);
  const q = `[out:json][timeout:15];(node["amenity"="pharmacy"](around:${radius},${lat},${lon});way["amenity"="pharmacy"](around:${radius},${lat},${lon}););out center;`;
  const data = await queryOverpass(q);
  if (data) return res.status(200).json(mapElements(data));
  res.status(502).json({ error: 'Overpass indisponible' });
}

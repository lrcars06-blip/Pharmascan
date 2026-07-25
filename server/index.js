/* ============================================================
   Pharmascan — petit back-end (Express)
   Rôle : interroger les sources officielles côté serveur.
   Avantages : règle le CORS, centralise les appels, et permet
   plus tard d'ajouter des clés d'API (ex. statut rupture ANSM)
   et un cache, sans toucher au front.

   Démarrage : npm run server  (port 8787)
   En dev, Vite proxie /api -> http://localhost:8787 (voir vite.config.js)
   ============================================================ */
import express from 'express';
import { getConseil } from '../api/_lib/conseil.js';

const app = express();
const PORT = process.env.PORT || 8787;

// Middleware CORS et JSON
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cache-Control', 'public, max-age=3600');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());

const BDPM = 'https://medicaments-api.giygas.dev/v1';
const OBF = 'https://world.openbeautyfacts.org/api/v2';
const PRICES = 'https://prices.openfoodfacts.org/api/v1';
const BAN = 'https://api-adresse.data.gouv.fr';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const noAccents = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

async function getJson(url, opts) {
  try {
    const r = await fetch(url, { ...opts, timeout: 8000 });
    if (!r.ok) {
      console.warn(`[API] ${r.status} - ${url}`);
      throw new Error('upstream ' + r.status);
    }
    return r.json();
  } catch (e) {
    console.error(`[API ERROR] ${url}:`, e.message);
    throw new Error('api_error');
  }
}

// --- Médicaments (BDPM) ---
app.get('/api/medicaments', async (req, res) => {
  try {
    const { search, cip } = req.query;
    if (cip) return res.json(await getJson(`${BDPM}/medicaments?cip=${encodeURIComponent(cip)}`));
    if (search) return res.json(await getJson(`${BDPM}/medicaments?search=${encodeURIComponent(noAccents(search))}`));
    res.status(400).json({ error: 'search ou cip requis' });
  } catch (e) { res.status(502).json({ error: 'BDPM indisponible' }); }
});

app.get('/api/generiques', async (req, res) => {
  try {
    const { libelle } = req.query;
    res.json(await getJson(`${BDPM}/generiques?libelle=${encodeURIComponent(noAccents(libelle || ''))}`));
  } catch (e) { res.json([]); }
});

// --- Parapharmacie : cascade Open Beauty Facts → Open Food Facts → Open Products Facts ---
const PRODUCT_BASES = [
  'https://world.openbeautyfacts.org/api/v2',
  'https://world.openfoodfacts.org/api/v2',
  'https://world.openproductsfacts.org/api/v2',
];
app.get('/api/parapharmacie/:code', async (req, res) => {
  const fields = 'product_name,product_name_fr,brands,ingredients_text_fr,ingredients_text,allergens_tags';
  for (const base of PRODUCT_BASES) {
    try {
      const data = await getJson(`${base}/product/${encodeURIComponent(req.params.code)}.json?fields=${fields}`);
      if (data && data.status === 1 && data.product && data.product.product_name) return res.json(data);
    } catch (e) { /* base suivante */ }
  }
  res.json({ status: 0 });
});

// --- Prix indicatif (Open Prices) ---
app.get('/api/prix/:code', async (req, res) => {
  try {
    const data = await getJson(`${PRICES}/prices?product_code=${encodeURIComponent(req.params.code)}&order_by=-date&size=10`);
    res.json(data);
  } catch (e) { res.json({ items: [] }); }
});

// --- Communes (Base Adresse Nationale) : autocomplétion + géocodage ---
app.get('/api/communes', async (req, res) => {
  try {
    const q = req.query.q || '';
    const data = await getJson(`${BAN}/search/?q=${encodeURIComponent(q)}&type=municipality&autocomplete=1&limit=7`);
    const villes = (data.features || []).map((f) => {
      const c = (f.geometry && f.geometry.coordinates) || [];
      const p = f.properties || {};
      return { nom: p.city || p.name || p.label, cp: p.postcode || '', insee: p.citycode || '', lat: c[1], lon: c[0] };
    }).filter((v) => v.nom);
    res.json(villes);
  } catch (e) { res.json([]); }
});

// --- Pharmacies (OpenStreetMap / Overpass) ---
// Mode commune (insee) : TOUTES les pharmacies de la commune.
// Mode rayon (lat/lon/radius) : fallback pour les villages sans pharmacie.
const mapPharma = (data) => (data.elements || []).map((el) => {
  const t = el.tags || {};
  const plat = el.lat != null ? el.lat : el.center && el.center.lat;
  const plon = el.lon != null ? el.lon : el.center && el.center.lon;
  const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return { name: t.name || 'Pharmacie', addr, phone: t.phone || t['contact:phone'] || '', lat: plat, lon: plon };
}).filter((p) => p.lat != null && p.lon != null);

app.get('/api/pharmacies', async (req, res) => {
  const { lat, lon, insee } = req.query;
  let q;
  if (insee && /^\d[0-9AB]\d{3}$/i.test(insee)) {
    q = `[out:json][timeout:15];area["ref:INSEE"="${insee.toUpperCase()}"]->.a;(node["amenity"="pharmacy"](area.a);way["amenity"="pharmacy"](area.a););out center;`;
  } else if (lat && lon) {
    const radius = Math.min(Math.max(parseInt(req.query.radius, 10) || 5000, 1000), 30000);
    q = `[out:json][timeout:15];(node["amenity"="pharmacy"](around:${radius},${lat},${lon});way["amenity"="pharmacy"](around:${radius},${lat},${lon}););out center;`;
  } else {
    return res.status(400).json({ error: 'insee ou lat/lon requis' });
  }
  for (const ep of OVERPASS) {
    try {
      const data = await getJson(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      return res.json(mapPharma(data));
    } catch (e) { /* essaie le miroir suivant */ }
  }
  res.status(502).json({ error: 'Overpass indisponible' });
});

// --- Conseil IA parapharmacie ---
app.post('/api/conseil', async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 2000) {
    return res.status(400).json({ error: 'message requis (max 2000 caractères)' });
  }
  try {
    res.json(await getConseil(message, Array.isArray(history) ? history : []));
  } catch (e) {
    console.error('[conseil]', e);
    res.status(502).json({ error: 'Conseil indisponible' });
  }
});

// --- Statut de disponibilité (rupture / tension) ---
// À CONNECTER : source officielle ANSM (Trustmed) via une API d'éditeur
// (ex. Synapse, Claude Bernard — gratuites mais sur inscription).
// Pour l'instant, statut neutre "disponible".
app.get('/api/disponibilite/:cis', (req, res) => {
  res.json({ statut: 'disponible', source: 'placeholder', note: 'À connecter à la source officielle ANSM.' });
});

app.listen(PORT, () => console.log(`Pharmascan API sur http://localhost:${PORT}`));

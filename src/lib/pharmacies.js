// Pharmacies & communes.
// Les ~19 700 officines sont embarquées (public/data/pharmacies/<dept>.json) :
// recherche par commune ou « autour d'un point » sans aucun service externe.
// Seule l'autocomplétion des communes interroge un service (Géoplateforme IGN).
import { getJSON, normalize } from './http.js';

const GEOCODE = 'https://data.geopf.fr/geocodage/search';
export const MONACO = { nom: 'Monaco', cp: '98000', insee: 'MC', lat: 43.7384, lon: 7.4246 };

// Paris, Lyon, Marseille : les officines sont rangées par arrondissement.
const ARRONDISSEMENTS = { 75056: '751', 69123: '6938', 13055: '132' };

export async function searchCommunes(query, signal) {
  const q = query.trim();
  let items = [];
  if (q.length >= 2 && 'monaco'.startsWith(normalize(q))) items.push(MONACO);
  if (q.length < 2) return items;
  const params = `q=${encodeURIComponent(q)}&type=municipality&autocomplete=1&limit=7`;
  let data;
  try { data = await getJSON(`${GEOCODE}?${params}`, { signal }); }
  catch (e) {
    if (e.name === 'AbortError') throw e;
    data = { features: [] };
    try { items = items.concat(await getJSON(`/api/communes?q=${encodeURIComponent(q)}`, { signal })); } catch { /* hors ligne */ }
  }
  for (const f of data.features || []) {
    const p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
    if (p.city || p.name) items.push({ nom: p.city || p.name, cp: p.postcode || '', insee: p.citycode || '', lat: c[1], lon: c[0] });
  }
  return items.slice(0, 8);
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const withDistance = (list, lat, lon) => list
  .map((p) => ({ ...p, dist: distanceKm(lat, lon, p.lat, p.lon) }))
  .sort((a, b) => a.dist - b.dist);

const meta = () => getJSON('/data/pharmacies/meta.json');
const dept = (code) => getJSON(`/data/pharmacies/${code}.json`);
const deptOf = (insee) => (insee === 'MC' ? 'MC' : /^9[78]/.test(insee) ? insee.slice(0, 3) : insee.slice(0, 2));

async function parCommune(insee) {
  const code = String(insee || '').toUpperCase();
  if (code !== 'MC' && !/^\d[0-9AB]\d{3}$/.test(code)) return [];
  const m = await meta();
  if (m.depts && !m.depts[deptOf(code)]) return [];
  const list = await dept(deptOf(code));
  const prefix = ARRONDISSEMENTS[code];
  return list.filter((p) => (prefix ? p.insee.startsWith(prefix) : p.insee === code));
}

// Officines dans un rayon donné : on ne charge que les départements dont
// l'emprise (bbox dans meta.json) touche le cercle de recherche.
async function autour(lat, lon, rayonKm) {
  const m = await meta();
  const dLat = rayonKm / 111, dLon = rayonKm / (111 * Math.cos((lat * Math.PI) / 180));
  const codes = Object.entries(m.depts || {})
    .filter(([, [a, b, c, d]]) => lat >= a - dLat && lat <= c + dLat && lon >= b - dLon && lon <= d + dLon)
    .map(([code]) => code);
  const lists = await Promise.all(codes.map(dept));
  return withDistance(lists.flat(), lat, lon).filter((p) => p.dist <= rayonKm);
}

const RAYONS = [5, 15, 30];

// 1) Toutes les pharmacies de la commune. 2) Sinon, rayon progressif 5 → 15 → 30 km.
// 3) Si la base locale est inaccessible : secours OpenStreetMap via /api/pharmacies.
export async function findPharmacies({ lat, lon, insee, ville }) {
  try {
    if (insee) {
      const hits = await parCommune(insee);
      if (hits.length) return { list: withDistance(hits, lat, lon).slice(0, 100), mode: 'commune', total: hits.length };
    }
    if (insee !== 'MC') {
      const proches = await autour(lat, lon, RAYONS[RAYONS.length - 1]);
      for (const r of RAYONS) {
        const hits = proches.filter((p) => p.dist <= r);
        if (hits.length) return { list: hits.slice(0, 20), mode: 'rayon', radius: r };
      }
      return { list: [], mode: 'rayon', radius: RAYONS[RAYONS.length - 1] };
    }
  } catch (e) { /* base locale indisponible → secours distant */ }

  const v = ville ? `&ville=${encodeURIComponent(ville)}` : '';
  const radius = insee === 'MC' ? 2500 : 15000;
  try {
    const list = await getJSON(`/api/pharmacies?lat=${lat}&lon=${lon}&radius=${radius}${v}`, { ttl: 3600e3 });
    return { list: withDistance(Array.isArray(list) ? list : [], lat, lon).slice(0, 30), mode: 'rayon', radius: radius / 1000 };
  } catch (e) {
    // Monaco sans réseau cartographique : au moins les officines françaises limitrophes (Beausoleil, Cap-d'Ail).
    if (insee !== 'MC') throw e;
    const proches = await autour(lat, lon, 5);
    if (!proches.length) throw e;
    return { list: proches.slice(0, 20), mode: 'rayon', radius: 5, partiel: true };
  }
}

export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('indisponible'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}

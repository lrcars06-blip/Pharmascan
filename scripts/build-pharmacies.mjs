/* ============================================================
   Construit la base locale de TOUTES les pharmacies de France.

   1. Télécharge les ~21 000 officines depuis OpenStreetMap
      (requête Overpass France entière, 3 miroirs).
   2. Attribue à chacune sa commune (code INSEE) via le service
      officiel de l'État : Base Adresse Nationale, en masse.
   3. Écrit public/data/pharmacies/<departement>.json

   Usage :  npm run build:pharmacies   (compter 2 à 5 minutes)
   Relancer de temps en temps pour rafraîchir les données.
   ============================================================ */
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'pharmacies');

const OVERPASS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const UA = { 'User-Agent': 'Pharmascan/1.0 (construction base locale, usage unique)' };

// --- Étape 1 : toutes les pharmacies de France depuis OpenStreetMap ---
async function overpassFrance() {
  const q = `[out:json][timeout:300];area["ISO3166-1"="FR"][admin_level=2]->.fr;(node["amenity"="pharmacy"](area.fr);way["amenity"="pharmacy"](area.fr););out center tags;`;
  for (const ep of OVERPASS) {
    try {
      console.log('Téléchargement OpenStreetMap via', new URL(ep).host, '… (1 à 3 min)');
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...UA },
        body: 'data=' + encodeURIComponent(q),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (data.elements && data.elements.length > 5000) return data.elements;
      throw new Error('réponse trop petite (' + (data.elements || []).length + ')');
    } catch (e) {
      console.warn('  ⚠️ échec :', e.message, '— miroir suivant');
    }
  }
  throw new Error('Tous les miroirs OpenStreetMap sont indisponibles. Réessayez dans 10 minutes.');
}

// --- Étape 2 : code INSEE de chaque pharmacie via la BAN (par lots CSV) ---
async function reverseBatch(points) {
  const csv = 'lat,lon\n' + points.map((p) => `${p.lat},${p.lon}`).join('\n');
  const fd = new FormData();
  fd.append('data', new Blob([csv], { type: 'text/csv' }), 'points.csv');
  fd.append('result_columns', 'result_citycode');
  fd.append('result_columns', 'result_city');
  const r = await fetch('https://api-adresse.data.gouv.fr/reverse/csv/', { method: 'POST', body: fd, headers: UA });
  if (!r.ok) throw new Error('BAN HTTP ' + r.status);
  const lines = (await r.text()).trim().split('\n').slice(1);
  return lines.map((line) => {
    const cols = line.split(',');
    return { insee: (cols[2] || '').toUpperCase(), ville: cols[3] || '' };
  });
}

const elements = await overpassFrance();
console.log(elements.length, 'pharmacies téléchargées. Normalisation…');

const brutes = elements.map((el) => {
  const t = el.tags || {};
  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lon = el.lon != null ? el.lon : el.center && el.center.lon;
  return {
    name: t.name || 'Pharmacie',
    addr: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
    phone: t.phone || t['contact:phone'] || '',
    lat, lon,
  };
}).filter((p) => p.lat != null && p.lon != null);

console.log('Attribution des communes (Base Adresse Nationale, par lots)…');
const LOT = 4000;
const enrichies = [];
for (let i = 0; i < brutes.length; i += LOT) {
  const lot = brutes.slice(i, i + LOT);
  process.stdout.write(`  lot ${Math.floor(i / LOT) + 1}/${Math.ceil(brutes.length / LOT)}… `);
  const geo = await reverseBatch(lot);
  lot.forEach((p, k) => enrichies.push({ ...p, insee: geo[k]?.insee || '', ville: geo[k]?.ville || '' }));
  console.log('ok');
}

const deptOf = (insee) => {
  if (!insee || insee.length < 5) return null;
  return insee.startsWith('97') || insee.startsWith('98') ? insee.slice(0, 3) : insee.slice(0, 2);
};

const parDept = new Map();
let ok = 0;
for (const p of enrichies) {
  const dept = deptOf(p.insee);
  if (!dept) continue;
  if (!parDept.has(dept)) parDept.set(dept, []);
  parDept.get(dept).push(p);
  ok++;
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
for (const [dept, list] of parDept) {
  writeFileSync(join(OUT_DIR, `${dept}.json`), JSON.stringify(list));
}
writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify({
  total: ok,
  departements: parDept.size,
  source: 'OpenStreetMap (Overpass) + Base Adresse Nationale',
  genere_le: new Date().toISOString().slice(0, 10),
}));

console.log(`✅ ${ok} pharmacies écrites dans ${parDept.size} fichiers départementaux.`);
console.log('   → public/data/pharmacies/');
console.log('   Prochaine étape : git add -A && git commit -m "base pharmacies" && git push');

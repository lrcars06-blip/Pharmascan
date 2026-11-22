/* ============================================================
   Construit la base locale de TOUTES les pharmacies de France.

   1. Télécharge les ~21 000 officines (amenity=pharmacy) et les
      parapharmacies (shop=chemist, marquées type:"para") depuis OpenStreetMap
      (requête Overpass France entière, 3 miroirs).
   2. Attribue à chacune sa commune (code INSEE) via le service
      officiel de l'État : Base Adresse Nationale, en masse.
   3. Écrit public/data/pharmacies/<departement>.json

   Usage :  npm run build:pharmacies   (compter 2 à 5 minutes)
            npm run build:pharmacies -- --meta-only
              (recalcule seulement meta.json à partir des fichiers existants)
   Relancer de temps en temps pour rafraîchir les données.

   meta.json contient l'emprise géographique (bbox) de chaque
   département : le site s'en sert pour chercher « autour d'un point »
   sans aucun service externe.
   ============================================================ */
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'pharmacies');

const OVERPASS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const UA = { 'User-Agent': 'Pharmascan/1.0 (construction base locale, usage unique)' };

// meta.json : compteurs + [latMin, lonMin, latMax, lonMax, nombre, latCentre, lonCentre] par département
function writeMeta(parDept, genereLe) {
  const depts = {};
  let total = 0;
  for (const [dept, list] of parDept) {
    let a = 90, b = 180, c = -90, d = -180, sLat = 0, sLon = 0;
    for (const p of list) { a = Math.min(a, p.lat); b = Math.min(b, p.lon); c = Math.max(c, p.lat); d = Math.max(d, p.lon); sLat += p.lat; sLon += p.lon; }
    const r = (x) => Math.round(x * 1e4) / 1e4;
    depts[dept] = [r(a), r(b), r(c), r(d), list.length, r(sLat / list.length), r(sLon / list.length)];
    total += list.length;
  }
  writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify({
    total, departements: parDept.size,
    source: 'OpenStreetMap (Overpass) + Base Adresse Nationale',
    genere_le: genereLe, depts,
  }));
  return total;
}

if (process.argv.includes('--meta-only')) {
  const parDept = new Map();
  for (const f of readdirSync(OUT_DIR)) {
    if (f === 'meta.json' || !f.endsWith('.json')) continue;
    parDept.set(f.replace('.json', ''), JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8')));
  }
  let date = new Date().toISOString().slice(0, 10);
  try { date = JSON.parse(readFileSync(join(OUT_DIR, 'meta.json'), 'utf8')).genere_le || date; } catch { /* pas de meta existant */ }
  console.log(`meta.json recalculé : ${writeMeta(parDept, date)} pharmacies, ${parDept.size} départements.`);
  process.exit(0);
}

// --- Étape 1 : toutes les pharmacies de France depuis OpenStreetMap ---
async function overpassPays(iso, minimum) {
  const q = `[out:json][timeout:300];area["ISO3166-1"="${iso}"][admin_level=2]->.z;(node["amenity"="pharmacy"](area.z);way["amenity"="pharmacy"](area.z);node["shop"="chemist"](area.z);way["shop"="chemist"](area.z););out center tags;`;
  for (const ep of OVERPASS) {
    try {
      console.log(`Téléchargement OpenStreetMap (${iso}) via`, new URL(ep).host, '…');
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...UA },
        body: 'data=' + encodeURIComponent(q),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (data.elements && data.elements.length >= minimum) return data.elements;
      throw new Error('réponse trop petite (' + (data.elements || []).length + ')');
    } catch (e) {
      console.warn('  ⚠️ échec :', e.message, '— miroir suivant');
    }
  }
  throw new Error('Tous les miroirs OpenStreetMap sont indisponibles. Réessayez dans 10 minutes.');
}

// --- Étape 2 : code INSEE de chaque pharmacie via la BAN (par lots CSV) ---
// Service : Géoplateforme IGN (successeur de api-adresse.data.gouv.fr, arrêté en 2026).
const csvCells = (line) => (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));

async function reverseBatch(points) {
  const csv = 'lat,lon\n' + points.map((p) => `${p.lat},${p.lon}`).join('\n');
  const fd = new FormData();
  fd.append('data', new Blob([csv], { type: 'text/csv' }), 'points.csv');
  for (const col of ['result_citycode', 'result_city', 'result_postcode']) fd.append('result_columns', col);
  const r = await fetch('https://data.geopf.fr/geocodage/reverse/csv', { method: 'POST', body: fd, headers: UA });
  if (!r.ok) throw new Error('Géocodage HTTP ' + r.status);
  const lines = (await r.text()).trim().split('\n').slice(1);
  if (lines.length !== points.length) throw new Error('Géocodage : réponse incomplète');
  return lines.map((line) => {
    const cols = csvCells(line.replace(/\r$/, ''));
    return { insee: (cols[2] || '').toUpperCase(), ville: cols[3] || '', cp: cols[4] || '' };
  });
}

const elements = await overpassPays('FR', 5000);
console.log(elements.length, 'pharmacies téléchargées. Normalisation…');

const normalise = (el) => {
  const t = el.tags || {};
  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lon = el.lon != null ? el.lon : el.center && el.center.lon;
  const para = t.amenity !== 'pharmacy'; // shop=chemist : parapharmacie (sans pharmacien, pas de médicaments)
  return {
    ...(para ? { type: 'para' } : {}),
    name: t.name || (para ? 'Parapharmacie' : 'Pharmacie'),
    addr: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
    phone: t.phone || t['contact:phone'] || '',
    lat, lon,
  };
};
const brutes = elements.map(normalise).filter((p) => p.lat != null && p.lon != null);

console.log('Attribution des communes (Géoplateforme / Base Adresse Nationale, par lots)…');
const LOT = 4000;
const enrichies = [];
for (let i = 0; i < brutes.length; i += LOT) {
  const lot = brutes.slice(i, i + LOT);
  process.stdout.write(`  lot ${Math.floor(i / LOT) + 1}/${Math.ceil(brutes.length / LOT)}… `);
  const geo = await reverseBatch(lot);
  lot.forEach((p, k) => enrichies.push({ ...p, insee: geo[k]?.insee || '', ville: geo[k]?.ville || '', cp: geo[k]?.cp || '' }));
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

// Monaco : hors Base Adresse Nationale, rangé dans son propre fichier MC.json
try {
  const mc = (await overpassPays('MC', 1)).map(normalise).filter((p) => p.lat != null && p.lon != null)
    .map((p) => ({ ...p, insee: 'MC', ville: 'Monaco', cp: '98000' }));
  if (mc.length) { parDept.set('MC', mc); ok += mc.length; }
} catch (e) { console.warn('  ⚠️ Monaco non récupéré :', e.message); }

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
for (const [dept, list] of parDept) {
  writeFileSync(join(OUT_DIR, `${dept}.json`), JSON.stringify(list));
}
writeMeta(parDept, new Date().toISOString().slice(0, 10));

console.log(`✅ ${ok} pharmacies écrites dans ${parDept.size} fichiers départementaux.`);
console.log('   → public/data/pharmacies/');
console.log('   Prochaine étape : git add -A && git commit -m "base pharmacies" && git push');

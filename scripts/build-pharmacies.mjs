/* ============================================================
   Construit la base locale de TOUTES les pharmacies de France.
   Source : export OpenStreetMap France (Opendatasoft, ~21 000
   officines, mis à jour en continu).

   Usage :  npm run build:pharmacies
   Sortie : public/data/pharmacies/<departement>.json
            public/data/pharmacies/meta.json

   Le site lit ensuite ces fichiers en priorité → résultats
   instantanés, zéro dépendance aux services externes.
   Relancer la commande de temps en temps pour rafraîchir.
   ============================================================ */
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'pharmacies');

const SOURCES = [
  // Export JSON complet du jeu de données OSM France « pharmacy »
  'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/osm-france-pharmacy/exports/json?lang=fr&timezone=Europe%2FParis',
  'https://public.opendatasoft.com/explore/dataset/osm-france-pharmacy/download/?format=json&timezone=Europe/Paris',
];

const pick = (...vals) => vals.find((v) => v != null && v !== '') ?? '';

function normalise(r) {
  // Les noms de champs varient selon la version de l'export — on couvre tout.
  const geo = r.meta_geo_point || r.geo_point_2d || r.geo_point || {};
  const lat = Number(pick(geo.lat, r.latitude, Array.isArray(geo) ? geo[0] : null));
  const lon = Number(pick(geo.lon, r.longitude, Array.isArray(geo) ? geo[1] : null));
  const insee = String(pick(r.meta_code_com, r.com_insee, r.insee, r.code_insee, r.meta_insee)).toUpperCase();
  return {
    name: pick(r.name, r.nom, 'Pharmacie') || 'Pharmacie',
    addr: pick(r.address, r.adresse, [pick(r.housenumber, r['addr_housenumber']), pick(r.street, r['addr_street'])].filter(Boolean).join(' ')),
    phone: pick(r.phone, r.telephone, r.contact_phone),
    ville: pick(r.meta_name_com, r.com_nom, r.commune, r.city),
    insee,
    lat,
    lon,
  };
}

function deptOf(insee) {
  if (!insee || insee.length < 5) return null;
  return insee.startsWith('97') || insee.startsWith('98') ? insee.slice(0, 3) : insee.slice(0, 2);
}

async function download() {
  for (const url of SOURCES) {
    try {
      console.log('Téléchargement :', url.split('?')[0], '…');
      const r = await fetch(url, { headers: { 'User-Agent': 'Pharmascan/1.0 (build local)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const rows = Array.isArray(data) ? data : data.results || data.records || [];
      if (rows.length > 1000) return rows.map((row) => row.fields ? { ...row.fields, ...row } : row);
      throw new Error('export trop petit (' + rows.length + ' lignes)');
    } catch (e) {
      console.warn('  ⚠️ échec :', e.message, '— on essaie la source suivante');
    }
  }
  throw new Error('Aucune source disponible. Vérifiez votre connexion et réessayez dans quelques minutes.');
}

const rows = await download();
console.log(rows.length, 'pharmacies téléchargées. Normalisation…');

const parDept = new Map();
let ok = 0;
for (const raw of rows) {
  const p = normalise(raw);
  const dept = deptOf(p.insee);
  if (!dept || isNaN(p.lat) || isNaN(p.lon)) continue;
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
  source: 'OpenStreetMap France (Opendatasoft)',
  genere_le: new Date().toISOString().slice(0, 10),
}));

console.log(`✅ ${ok} pharmacies écrites dans ${parDept.size} fichiers départementaux.`);
console.log('   → public/data/pharmacies/');
console.log('   Committez et poussez pour mettre le site à jour.');

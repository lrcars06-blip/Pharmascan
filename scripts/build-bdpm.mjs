/* ============================================================
   Construit la base médicaments locale à partir des fichiers
   OFFICIELS de la BDPM (ANSM / ministère de la Santé).

   Source : https://base-donnees-publique.medicaments.gouv.fr/telechargement
   Aucune API tierce : les fichiers publics sont téléchargés,
   contrôlés, puis découpés en petits fichiers statiques servis
   par le CDN (public/data/bdpm/).

     index.json   index de recherche (toutes les spécialités)
     d/NNN.json   fiches complètes, réparties sur 200 fichiers (CIS modulo 200)
     c/NN.json    table CIP7 → CIS, 100 fichiers (2 derniers chiffres du CIP7)
     g/NN.json    groupes génériques, 20 fichiers (identifiant modulo 20)
     meta.json    date de génération et compteurs

   Usage :  npm run build:bdpm     (rafraîchit la base ; échoue si la source est indisponible)

   Options : --soft         garde la base existante en cas d'échec
             --deploy-only  ne fait rien en local (seulement sur Vercel / CI)
   `npm run build` utilise les deux : chaque déploiement Vercel rafraîchit
   la base, sans jamais casser le build ni modifier vos fichiers en local.
   ============================================================ */
import { mkdirSync, writeFileSync, rmSync, renameSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SOFT = process.argv.includes('--soft');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const OUT = join(ROOT, 'bdpm');
const TMP = join(ROOT, 'bdpm.tmp');
const BASE = 'https://base-donnees-publique.medicaments.gouv.fr/download/file/';
const UA = { 'User-Agent': 'Pharmascan/1.0 (construction base locale BDPM)' };

if (process.argv.includes('--deploy-only') && !process.env.VERCEL && !process.env.CI && existsSync(join(OUT, 'index.json'))) {
  process.exit(0);
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const cp1252 = new TextDecoder('windows-1252');

// Les fichiers BDPM mélangent UTF-8 et Windows-1252 : on décode ligne par ligne.
function decodeLines(buf) {
  const lines = [];
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 10) {
      if (i > start) {
        const slice = buf.subarray(start, i);
        let s;
        try { s = utf8.decode(slice); } catch { s = cp1252.decode(slice); }
        s = s.replace(/\r$/, '');
        if (s.trim()) lines.push(s);
      }
      start = i + 1;
    }
  }
  return lines;
}

async function download(name, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + name, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return decodeLines(new Uint8Array(await r.arrayBuffer())).map((l) => l.split('\t').map((c) => c.trim()));
    } catch (e) { lastErr = e; }
  }
  throw new Error(`${name} : ${lastErr.message}`);
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const euro = (s) => { const n = parseFloat((s || '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const taux = (s) => clean(s).replace(/\s*%/, ' %');

async function main() {
  console.log('BDPM : téléchargement des fichiers officiels…');
  const [cis, cip, compo, gener, cpd, dispo] = await Promise.all([
    download('CIS_bdpm.txt'), download('CIS_CIP_bdpm.txt'), download('CIS_COMPO_bdpm.txt'),
    download('CIS_GENER_bdpm.txt'), download('CIS_CPD_bdpm.txt'), download('CIS_CIP_Dispo_Spec.txt'),
  ]);

  // Garde-fous : si le format officiel change, on s'arrête au lieu de publier une base fausse.
  const check = (cond, msg) => { if (!cond) throw new Error('Contrôle échoué — ' + msg); };
  check(cis.length > 10000, `seulement ${cis.length} spécialités`);
  check(cip.length > 15000, `seulement ${cip.length} présentations`);
  check(cis.every((r) => r.length >= 12 && /^\d{8}$/.test(r[0])), 'format CIS_bdpm inattendu');
  check(cip.filter((r) => /^\d{7}$/.test(r[1]) && /^\d{13}$/.test(r[6])).length > cip.length * 0.99, 'format CIS_CIP_bdpm inattendu');
  check(compo.length > 20000 && gener.length > 5000, 'fichiers composition / génériques incomplets');

  // --- Fiches ---
  const fiches = new Map();
  for (const r of cis) {
    fiches.set(r[0], {
      nom: clean(r[1]), forme: clean(r[2]), voies: clean(r[3]).split(';').map(clean).filter(Boolean).join(', '),
      titulaire: clean(r[10]), amm: clean(r[4]), commercialise: /^Commercialis/i.test(r[6]) ? 1 : 0,
      dateAmm: r[7], surveillance: /^oui$/i.test(r[11]) ? 1 : 0,
      substances: [], presentations: [], conditions: [],
    });
  }

  // Composition : substances actives (SA) ; à défaut, fractions thérapeutiques (FT)
  const parNature = new Map();
  for (const r of compo) {
    const f = fiches.get(r[0]); if (!f) continue;
    const key = r[0] + '|' + (r[6] || 'SA');
    if (!parNature.has(key)) parNature.set(key, []);
    parNature.get(key).push([clean(r[3]), clean(r[4]), clean(r[5])]);
  }
  for (const [id, f] of fiches) {
    const list = parNature.get(id + '|SA') || parNature.get(id + '|FT') || [];
    const seen = new Set();
    f.substances = list.filter((s) => { const k = s[0] + '|' + s[1]; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  // Présentations (boîtes) : CIP, prix public, remboursement
  const cipMap = new Map();
  for (const r of cip) {
    const f = fiches.get(r[0]); if (!f || !/^\d{7}$/.test(r[1])) continue;
    cipMap.set(r[1], r[0]);
    const p = { cip13: r[6], libelle: clean(r[2]), commercialisee: /^Déclaration de commercialisation/i.test(r[4]) ? 1 : 0 };
    if (!p.commercialisee) p.etat = clean(r[4]);
    if (r[8]) p.taux = taux(r[8]);
    const prix = euro(r[10]) ?? euro(r[9]);   // prix public, honoraire de dispensation inclus
    if (prix != null) p.prix = prix;
    if (euro(r[11]) != null) p.honoraire = euro(r[11]);
    f.presentations.push(p);
  }
  for (const f of fiches.values()) f.presentations.sort((a, b) => b.commercialisee - a.commercialisee);

  for (const r of cpd) { const f = fiches.get(r[0]); if (f && r[1]) f.conditions.push(clean(r[1])); }

  // Groupes génériques
  const TYPES = { 0: 'Princeps', 1: 'Générique', 2: 'Générique par complémentarité posologique', 4: 'Générique substituable' };
  const groupes = new Map();
  for (const r of gener) {
    const f = fiches.get(r[2]); if (!f) continue;
    if (!groupes.has(r[0])) groupes.set(r[0], { libelle: clean(r[1]), membres: [] });
    groupes.get(r[0]).membres.push([r[2], Number(r[3]), f.nom, f.commercialise, Number(r[4]) || 0]);
    f.groupe = { id: Number(r[0]), type: TYPES[r[3]] || '', libelle: clean(r[1]) };
  }
  for (const g of groupes.values()) {
    g.membres.sort((a, b) => a[1] - b[1] || a[4] - b[4]);
    g.membres = g.membres.map((m) => m.slice(0, 4));
  }

  // Disponibilité : signalements officiels ANSM (ruptures, tensions, arrêts, remises à disposition)
  let signalements = 0;
  for (const r of dispo) {
    const f = fiches.get(r[0]); if (!f || !r[3]) continue;
    const d = { code: Number(r[2]) || 0, statut: clean(r[3]), debut: r[4], maj: r[5] };
    if (r[6]) d.remise = r[6];
    if (/^https:\/\/ansm\.sante\.fr\//.test(r[7])) d.lien = r[7];
    if (r[1]) d.cip13 = r[1];
    (f.disponibilite ||= []).push(d);
  }
  // Un seul signalement par statut et par boîte : le plus récemment mis à jour.
  const jour = (s) => (s || '').split('/').reverse().join('');
  for (const f of fiches.values()) {
    if (!f.disponibilite) continue;
    const garde = new Map();
    for (const d of f.disponibilite) {
      const k = d.code + '|' + (d.cip13 || '');
      if (!garde.has(k) || jour(d.maj) > jour(garde.get(k).maj)) garde.set(k, d);
    }
    f.disponibilite = [...garde.values()].sort((a, b) => jour(b.maj).localeCompare(jour(a.maj)));
    signalements += f.disponibilite.length;
  }

  // --- Index de recherche (compact) ---
  const formes = [], titulaires = [];
  const idxOf = (arr, map, v) => { if (!map.has(v)) { map.set(v, arr.length); arr.push(v); } return map.get(v); };
  const fMap = new Map(), tMap = new Map();
  const rows = [];
  for (const [id, f] of fiches) {
    const suffix = ', ' + f.forme;
    const hasSuffix = f.forme && f.nom.endsWith(suffix);
    const subst = [...new Set(f.substances.map((s) => s[0]))].slice(0, 4).join(', ');
    rows.push([Number(id), hasSuffix ? f.nom.slice(0, -suffix.length) : f.nom, idxOf(formes, fMap, f.forme), idxOf(titulaires, tMap, f.titulaire),
      (f.commercialise ? 1 : 0) | (hasSuffix ? 2 : 0), subst]);
  }
  const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  rows.sort((a, b) => collator.compare(a[1], b[1]));

  // --- Écriture (dossier temporaire puis bascule) ---
  rmSync(TMP, { recursive: true, force: true });
  for (const d of ['d', 'c', 'g']) mkdirSync(join(TMP, d), { recursive: true });
  const shard = (dir, pad, entries, keyOf) => {
    const buckets = new Map();
    for (const [k, v] of entries) { const b = keyOf(k); if (!buckets.has(b)) buckets.set(b, {}); buckets.get(b)[k] = v; }
    for (const [b, obj] of buckets) writeFileSync(join(TMP, dir, String(b).padStart(pad, '0') + '.json'), JSON.stringify(obj));
    return buckets.size;
  };
  shard('d', 3, fiches, (k) => Number(k) % 200);
  shard('c', 2, cipMap, (k) => k.slice(-2));
  shard('g', 2, groupes, (k) => Number(k) % 20);
  writeFileSync(join(TMP, 'index.json'), JSON.stringify({ formes, titulaires, rows }));
  const meta = {
    genere_le: new Date().toISOString().slice(0, 10),
    specialites: fiches.size, presentations: cipMap.size, groupes: groupes.size, signalements,
    source: 'Base de données publique des médicaments (BDPM) — ANSM, HAS, UNCAM',
  };
  writeFileSync(join(TMP, 'meta.json'), JSON.stringify(meta));
  rmSync(OUT, { recursive: true, force: true });
  renameSync(TMP, OUT);
  console.log(`BDPM : ${meta.specialites} spécialités, ${meta.presentations} présentations, ${meta.groupes} groupes génériques, ${signalements} signalements de disponibilité.`);
}

main().catch((e) => {
  rmSync(TMP, { recursive: true, force: true });
  if (SOFT && existsSync(join(OUT, 'index.json'))) {
    console.warn(`BDPM : rafraîchissement impossible (${e.message}) — la base existante est conservée.`);
    process.exit(0);
  }
  console.error('BDPM : échec —', e.message);
  process.exit(1);
});

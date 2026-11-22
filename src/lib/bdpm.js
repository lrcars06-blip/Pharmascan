// Base médicaments LOCALE — fichiers statiques générés depuis la BDPM officielle
// (scripts/build-bdpm.mjs). Aucune API tierce : la recherche se fait dans le
// navigateur, donc instantanée et disponible hors ligne.
import { getJSON, normalize } from './http.js';

const ROOT = '/data/bdpm';
export const noticeUrl = (cis) => `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait#tab-notice`;
export const ficheOfficielleUrl = (cis) => `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait`;

let indexPromise = null;

// Index de recherche : ~15 800 spécialités, chargé une seule fois.
export function loadIndex() {
  if (!indexPromise) {
    indexPromise = getJSON(`${ROOT}/index.json`).then(({ formes, titulaires, rows }) => {
      const items = new Array(rows.length);
      const vocab = new Map(); // mot → fréquence (pour proposer une correction de frappe)
      const count = (w) => { if (w.length >= 4 && !/\d/.test(w)) vocab.set(w, (vocab.get(w) || 0) + 1); };
      for (let i = 0; i < rows.length; i++) {
        const [cis, base, f, t, flags, subst] = rows[i];
        const forme = formes[f] || '';
        const nom = flags & 2 ? `${base}, ${forme}` : base;
        const n = normalize(base), s = normalize(subst);
        items[i] = { cis, nom, forme, titulaire: titulaires[t] || '', commercialise: flags & 1, substances: subst, n, s, all: `${n} | ${s}` };
        count(n.split(' ', 1)[0]);
        for (const w of s.split(' ')) count(w);
      }
      return { items, vocab };
    });
    indexPromise.catch(() => { indexPromise = null; });
  }
  return indexPromise;
}

export const loadMeta = () => getJSON(`${ROOT}/meta.json`);

function rank(items, tokens, q) {
  const t0 = tokens[0];
  const out = [];
  for (const it of items) {
    let ok = true;
    for (const t of tokens) if (!it.all.includes(t)) { ok = false; break; }
    if (!ok) continue;
    let score;
    if (it.n.startsWith(q)) score = 1000;
    else if (it.n.startsWith(t0) || it.n.includes(' ' + t0)) score = 500;
    else if (it.s.startsWith(t0) || it.s.includes(' ' + t0)) score = 300;
    else score = 100;
    if (it.commercialise) score += 50;
    out.push([score, it]);
  }
  // Tri stable : à score égal, l'ordre alphabétique de l'index est conservé.
  out.sort((a, b) => b[0] - a[0]);
  return out;
}

// Distance d'édition bornée (insertion, suppression, substitution, inversion).
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

function closest(vocab, word) {
  if (word.length < 4) return null;
  const max = word.length <= 5 ? 1 : 2;
  let best = null, bestD = max + 1, bestF = 0;
  for (const [w, freq] of vocab) {
    if (w[0] !== word[0] && w[1] !== word[1]) continue;
    const d = distance(word, w, max);
    if (d < bestD || (d === bestD && freq > bestF)) { best = w; bestD = d; bestF = freq; }
  }
  return bestD <= max ? best : null;
}

// Recherche par nom ou substance active. Renvoie { total, items, corrige }.
export async function searchMedicaments(query, limit = 40) {
  const q = normalize(query);
  if (q.length < 2) return { total: 0, items: [], corrige: null };
  const { items, vocab } = await loadIndex();
  let tokens = q.split(' ');
  let ranked = rank(items, tokens, q);
  let corrige = null;
  if (!ranked.length) {
    // Aucun résultat : on tente de corriger une faute de frappe (« dolipranne » → « doliprane »).
    const fixed = tokens.map((t) => (vocab.has(t) ? t : closest(vocab, t) || t));
    if (fixed.join(' ') !== q) {
      ranked = rank(items, fixed, fixed.join(' '));
      if (ranked.length) corrige = fixed.join(' ');
    }
  }
  return { total: ranked.length, items: ranked.slice(0, limit).map((r) => r[1]), corrige };
}

const pad = (n, len) => String(n).padStart(len, '0');

// Fiche complète d'une spécialité (identifiant CIS).
export async function getFiche(cis) {
  const id = String(cis);
  if (!/^\d{8}$/.test(id)) return null;
  const shard = await getJSON(`${ROOT}/d/${pad(Number(id) % 200, 3)}.json`);
  return shard[id] ? { cis: id, ...shard[id] } : null;
}

// Code CIP 7 (ou CIP 13) lu sur la boîte → fiche.
export async function getFicheByCip(cip7) {
  if (!/^\d{7}$/.test(cip7 || '')) return null;
  let shard;
  try { shard = await getJSON(`${ROOT}/c/${cip7.slice(-2)}.json`); }
  catch (e) { if (e.status === 404) return null; throw e; }
  return shard[cip7] ? getFiche(shard[cip7]) : null;
}

// Groupe générique : médicaments ayant la même substance active, le même dosage et la même forme.
export async function getGroupe(id) {
  try {
    const shard = await getJSON(`${ROOT}/g/${pad(Number(id) % 20, 2)}.json`);
    const g = shard[String(id)];
    if (!g) return null;
    return { libelle: g.libelle, membres: g.membres.map(([cis, type, nom, commercialise]) => ({ cis: String(cis), type, nom, commercialise })) };
  } catch { return null; }
}

export function substancesOf(fiche) {
  return (fiche.substances || []).map(([nom, dosage]) => `${nom}${dosage ? ' ' + dosage : ''}`);
}

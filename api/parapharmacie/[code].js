/* Produit de parapharmacie par code-barres.
   Les 3 bases ouvertes et les prix sont interrogés EN PARALLÈLE ; on retient
   la première base (par ordre de priorité) qui connaît le produit :
     1. Open Beauty Facts   (cosmétiques, hygiène)
     2. Open Food Facts     (compléments alimentaires, nutrition)
     3. Open Products Facts (autres produits)
   Réponse : { status, product, source, prix } — un seul aller-retour pour le site. */
import { cache, preflight, fetchJson } from '../_lib/http.js';

const BASES = [
  ['Open Beauty Facts', 'https://world.openbeautyfacts.org/api/v2'],
  ['Open Food Facts', 'https://world.openfoodfacts.org/api/v2'],
  ['Open Products Facts', 'https://world.openproductsfacts.org/api/v2'],
];
const PRICES = 'https://prices.openfoodfacts.org/api/v1/prices';
const FIELDS = 'product_name,product_name_fr,brands,quantity,ingredients_text_fr,ingredients_text,allergens_tags';

async function prixIndicatif(code) {
  const data = await fetchJson(`${PRICES}?product_code=${code}&order_by=-date&size=10`, { timeout: 4000 });
  const items = ((data && data.items) || []).filter((x) => x && x.price != null && Number.isFinite(Number(x.price)) && (x.currency || 'EUR') === 'EUR');
  if (!items.length) return null;
  const prices = items.map((x) => Number(x.price));
  return { min: Math.min(...prices), max: Math.max(...prices), releves: prices.length, date: items[0].date || '' };
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  const code = String(req.query.code || '').replace(/\s/g, '');
  if (!/^\d{8,14}$/.test(code)) return res.status(400).json({ status: 0, error: 'code-barres invalide' });

  const prix = prixIndicatif(code);
  const lookups = BASES.map(([source, base]) =>
    fetchJson(`${base}/product/${code}.json?fields=${FIELDS}`, { timeout: 6000 })
      .then((d) => (d && d.status === 1 && d.product && (d.product.product_name_fr || d.product.product_name) ? { source, product: d.product } : null)));

  for (const lookup of lookups) {
    const hit = await lookup; // déjà en cours : on attend seulement par ordre de priorité
    if (hit) {
      cache(res);
      return res.status(200).json({ status: 1, source: hit.source, product: hit.product, prix: await prix });
    }
  }
  // Inconnu aujourd'hui, peut-être ajouté demain : cache court.
  cache(res, { browser: 300, cdn: 600, swr: 3600 });
  res.status(200).json({ status: 0 });
}

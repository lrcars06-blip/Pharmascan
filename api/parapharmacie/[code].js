/* Recherche produit par code-barres — cascade sur 3 bases ouvertes :
   1. Open Beauty Facts   (cosmétiques, hygiène)
   2. Open Food Facts     (compléments alimentaires, nutrition)
   3. Open Products Facts (autres produits)
   → couverture maximale des produits de parapharmacie. */

const BASES = [
  'https://world.openbeautyfacts.org/api/v2',
  'https://world.openfoodfacts.org/api/v2',
  'https://world.openproductsfacts.org/api/v2',
];

const FIELDS = 'product_name,product_name_fr,brands,ingredients_text_fr,ingredients_text,allergens_tags';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code } = req.query;

  for (const base of BASES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(`${base}/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
        headers: { 'User-Agent': 'Pharmascan/1.0 (application sante grand public)' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) continue;
      const data = await r.json();
      if (data && data.status === 1 && data.product && data.product.product_name) {
        return res.status(200).json(data);
      }
    } catch (e) { /* base suivante */ }
  }

  res.status(200).json({ status: 0 });
}

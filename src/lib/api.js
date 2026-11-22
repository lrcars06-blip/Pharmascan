// Appels au back-end (/api) — uniquement ce qui ne peut pas être embarqué :
// la base produits de parapharmacie (plusieurs millions de références) et le conseil.
import { getJSON } from './http.js';

// Produit + prix indicatif en UN appel (la fonction interroge les bases en parallèle).
export async function searchParapharmacie(code) {
  const data = await getJSON(`/api/parapharmacie/${encodeURIComponent(code)}`, { ttl: 3600e3 });
  if (data.status !== 1 || !data.product) return null;
  return { ...data.product, source: data.source || 'Open Beauty Facts', prix: data.prix || null };
}

export async function conseilIA(message, history) {
  const r = await fetch('/api/conseil', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
  if (!r.ok) throw new Error('conseil ' + r.status);
  return r.json();
}

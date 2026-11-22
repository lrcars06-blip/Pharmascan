import { getConseil } from './_lib/conseil.js';

// Limite d'appels par adresse (au mieux : la mémoire d'une fonction serverless n'est pas partagée
// entre instances). Elle freine les abus simples ; pour une vraie limite, utiliser Vercel Firewall.
const hits = new Map();
const LIMITE = 12, FENETRE = 10 * 60 * 1000;
function tropDappels(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < FENETRE);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > LIMITE;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });

  const ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0].trim();
  if (tropDappels(ip)) return res.status(429).json({ error: 'Trop de demandes. Réessayez dans quelques minutes.' });

  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 2000) {
    return res.status(400).json({ error: 'message requis (max 2000 caractères)' });
  }

  try {
    // Historique borné : 8 derniers tours, texte uniquement, 2000 caractères par tour.
    const tours = (Array.isArray(history) ? history : [])
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .slice(-8)
      .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }));
    res.setHeader('Cache-Control', 'no-store');
    const conseil = await getConseil(message, tours);
    res.status(200).json(conseil);
  } catch (e) {
    console.error('[api/conseil]', e);
    res.status(502).json({ error: 'Conseil indisponible' });
  }
}

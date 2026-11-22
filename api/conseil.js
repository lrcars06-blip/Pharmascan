import { getConseil } from './_lib/conseil.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });

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

// Armoire à pharmacie — persistance locale.
// Stocke les médicaments avec catégorie, date d'expiration, quantité et rappels.

const KEY = 'pharmascan_armoire';
const FICHE_KEY = 'pharmascan_fiche_medicale';

const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return k in mem ? mem[k] : null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
};

export function loadArmoire() {
  try {
    const a = JSON.parse(store.get(KEY) || '[]');
    if (!Array.isArray(a)) return [];
    // Tolère les anciennes entrées incomplètes
    return a.filter((x) => x && x.id && x.name).map((x) => ({ category: 'autre', quantity: 1, expirationDate: '', notes: '', ...x, reminders: { matin: false, midi: false, soir: false, ...(x.reminders || {}) } }));
  } catch { return []; }
}

export function saveArmoire(a) {
  store.set(KEY, JSON.stringify(a));
  // Prévient les écrans ouverts (l'armoire reste affichée en arrière-plan)
  try { window.dispatchEvent(new Event('pharmascan:armoire')); } catch { /* hors navigateur */ }
}

export function onArmoireChange(callback) {
  window.addEventListener('pharmascan:armoire', callback);
  return () => window.removeEventListener('pharmascan:armoire', callback);
}

export function addMed(med) {
  const a = loadArmoire();
  const newMed = {
    id: med.id || `med_${Date.now()}`,
    name: med.name,
    substance: med.substance || '',
    category: med.category || 'autre',
    quantity: med.quantity || 1,
    expirationDate: med.expirationDate || '',
    addedDate: med.addedDate || new Date().toISOString().split('T')[0],
    reminders: med.reminders || { matin: false, midi: false, soir: false },
    notes: med.notes || '',
  };
  if (med.cis) newMed.cis = String(med.cis);
  if (!a.find((x) => x.id === newMed.id)) {
    a.push(newMed);
    saveArmoire(a);
  }
  return a;
}

export const hasMed = (id) => loadArmoire().some((x) => x.id === String(id));

export function removeMed(id) {
  const a = loadArmoire().filter((x) => x.id !== id);
  saveArmoire(a);
  return a;
}

export function updateMed(id, updates) {
  const a = loadArmoire();
  const med = a.find((x) => x.id === id);
  if (med) {
    Object.assign(med, updates);
    saveArmoire(a);
  }
  return a;
}

export function toggleReminder(id, slot) {
  const a = loadArmoire();
  const it = a.find((x) => x.id === id);
  if (it) { it.reminders[slot] = !it.reminders[slot]; saveArmoire(a); }
  return a;
}

// Une date de péremption « 2026-11-30 » reste valable jusqu'à la fin de cette journée (heure locale).
function daysLeft(expirationDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(expirationDate || '');
  if (!m) return null;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  return Math.floor((end - new Date()) / 86400000);
}

export function isExpired(expirationDate) {
  const d = daysLeft(expirationDate);
  return d !== null && d < 0;
}

export function isExpiringSoon(expirationDate) {
  const d = daysLeft(expirationDate);
  return d !== null && d >= 0 && d <= 30;
}

export const formatDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

// --- Médicaments consultés récemment ---
const RECENTS_KEY = 'pharmascan_recents';

export function loadRecents() {
  try { const r = JSON.parse(store.get(RECENTS_KEY) || '[]'); return Array.isArray(r) ? r : []; } catch { return []; }
}

export function pushRecent(cis, nom) {
  const list = [{ cis: String(cis), nom }, ...loadRecents().filter((r) => r.cis !== String(cis))].slice(0, 6);
  store.set(RECENTS_KEY, JSON.stringify(list));
  return list;
}

// --- Fiche médicale d'urgence ---

export const FICHE_DEFAULTS = {
  prenom: '', nom: '', dateNaissance: '', groupeSanguin: '',
  adresse: '',
  contactNom: '', contactTel: '', contactLien: '',
  allergies: '', traitements: '', antecedents: '', notes: '',
};

export function loadFiche() {
  try { return { ...FICHE_DEFAULTS, ...JSON.parse(store.get(FICHE_KEY) || '{}') }; } catch { return { ...FICHE_DEFAULTS }; }
}

export function saveFiche(fiche) { store.set(FICHE_KEY, JSON.stringify(fiche)); }

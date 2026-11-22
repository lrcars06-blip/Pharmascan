// Lecture des codes scannés sur les boîtes.
//
// Médicaments français : presque toutes les boîtes portent un DataMatrix GS1
// (petit carré) qui contient le code CIP 13, la date de péremption et le lot :
//   (01) 0 3400935955838  (17) 270930  (10) LOT123
// Les anciens codes-barres linéaires portent le CIP 13 seul (3400…).
// Tout autre EAN (cosmétique, complément) relève de la parapharmacie.

const FIXED = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
const VARIABLE = new Set(['10', '21', '22']);
const GS = '\u001d';

function gs1(raw) {
  let s = raw.replace(/^\](d2|C1|Q3|e0)/, '');
  while (s.startsWith(GS)) s = s.slice(1);
  if (!/^01\d{14}/.test(s)) return null;
  const out = {};
  let i = 0;
  while (i < s.length - 1) {
    if (s[i] === GS) { i++; continue; }
    const ai = s.slice(i, i + 2);
    if (FIXED[ai]) { out[ai] = s.slice(i + 2, i + 2 + FIXED[ai]); i += 2 + FIXED[ai]; }
    else if (VARIABLE.has(ai)) {
      let end = s.indexOf(GS, i + 2);
      if (end === -1) end = s.length;
      out[ai] = s.slice(i + 2, end); i = end + 1;
    } else break;
  }
  return out;
}

// « 270930 » → « 2027-09-30 » ; jour « 00 » = dernier jour du mois.
function expiry(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd || '')) return '';
  const y = 2000 + Number(yymmdd.slice(0, 2)), m = Number(yymmdd.slice(2, 4));
  let d = Number(yymmdd.slice(4, 6));
  if (m < 1 || m > 12) return '';
  if (d === 0) d = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const cip = (cip13, extra = {}) => ({ type: 'cip', cip13, cip7: cip13.slice(5, 12), ...extra });

export function parseCode(input) {
  const raw = String(input || '').trim();
  if (!raw) return { type: 'empty' };

  const g = gs1(raw);
  if (g && g['01']) {
    const extra = { peremption: expiry(g['17']), lot: g['10'] || '' };
    if (/^034009\d{8}$/.test(g['01'])) return cip(g['01'].slice(1), extra);
    return { type: 'ean', ean: g['01'].replace(/^0/, ''), ...extra };
  }

  const digits = raw.replace(/[\s.\-]/g, '');
  if (/^\d+$/.test(digits)) {
    if (/^034009\d{8}$/.test(digits)) return cip(digits.slice(1));
    if (/^34009\d{8}$/.test(digits)) return cip(digits);
    if (/^\d{7}$/.test(digits)) return { type: 'cip', cip7: digits, cip13: '' };
    if (/^\d{8,14}$/.test(digits)) return { type: 'ean', ean: digits };
    return { type: 'inconnu', digits };
  }

  // Code composite mal découpé : on cherche tout de même un CIP 13 à l'intérieur.
  const m = raw.match(/(?:^|\D|01)0?(34009\d{8})/);
  if (m) return cip(m[1]);
  return { type: 'texte', texte: raw };
}

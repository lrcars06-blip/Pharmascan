// Rappels SANS serveur ni compte : on génère un fichier d'agenda (.ics) que
// l'agenda du téléphone importe. Les alertes sont ensuite gérées par l'agenda
// lui-même, même si Pharmascan est fermé. Aucune donnée ne quitte l'appareil.

const HEURES = { matin: '080000', midi: '123000', soir: '200000' };
const LIBELLES = { matin: 'du matin', midi: 'du midi', soir: 'du soir' };
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

function event({ uid, title, description, lines }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  return ['BEGIN:VEVENT', `UID:${uid}@pharmascan`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(description)}`, ...lines,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT'];
}

export function buildCalendar(items) {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pharmascan//Armoire//FR', 'CALSCALE:GREGORIAN'];
  let count = 0;

  // 1. Péremption : alerte 30 jours avant (ou demain si c'est déjà trop proche)
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
  for (const it of items) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(it.expirationDate || '');
    if (!m) continue;
    const exp = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (exp < tomorrow) continue;
    let day = new Date(exp); day.setDate(day.getDate() - 30);
    if (day < tomorrow) day = tomorrow;
    const next = new Date(day); next.setDate(next.getDate() + 1);
    out.push(...event({
      uid: `peremption-${it.id}`, title: `${it.name} périme le ${m[3]}/${m[2]}/${m[1]}`,
      description: 'Rappel Pharmascan. Rapportez les médicaments périmés en pharmacie.',
      lines: [`DTSTART;VALUE=DATE:${ymd(day)}`, `DTEND;VALUE=DATE:${ymd(next)}`],
    }));
    count++;
  }

  // 2. Prises de la journée : un rappel quotidien par moment, avec la liste des produits
  const today = ymd(new Date());
  for (const slot of Object.keys(HEURES)) {
    const names = items.filter((it) => it.reminders && it.reminders[slot]).map((it) => it.name);
    if (!names.length) continue;
    out.push(...event({
      uid: `prise-${slot}`, title: `Prise ${LIBELLES[slot]} : ${names.length} produit${names.length > 1 ? 's' : ''}`,
      description: names.join('\n'),
      lines: [`DTSTART:${today}T${HEURES[slot]}`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY'],
    }));
    count++;
  }
  out.push('END:VCALENDAR');
  return { text: out.join('\r\n'), count };
}

export function downloadCalendar(items) {
  const { text, count } = buildCalendar(items);
  if (!count) return 0;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'pharmascan-rappels.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return count;
}

// Liste lisible à transmettre à un médecin, un pharmacien ou un proche.
export function armoireText(items) {
  const fr = (iso) => iso.split('-').reverse().join('/');
  const lines = ['MES MÉDICAMENTS ET PRODUITS DE SANTÉ', `Liste établie le ${new Date().toLocaleDateString('fr-FR')} avec Pharmascan`, ''];
  for (const it of items) {
    const prises = ['matin', 'midi', 'soir'].filter((s) => it.reminders && it.reminders[s]);
    lines.push(`• ${it.name}`);
    if (it.substance) lines.push(`  Substance : ${it.substance}`);
    if (prises.length) lines.push(`  Prises : ${prises.join(', ')}`);
    if (it.expirationDate) lines.push(`  Péremption : ${fr(it.expirationDate)}`);
    if (it.notes) lines.push(`  Note : ${it.notes}`);
  }
  return lines.join('\n');
}

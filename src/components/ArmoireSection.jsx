import { useEffect, useRef, useState } from 'react';
import { loadArmoire, addMed, removeMed, updateMed, toggleReminder, isExpiringSoon, isExpired, formatDate, onArmoireChange } from '../lib/storage.js';
import { navigate } from '../lib/route.js';
import { getFiche } from '../lib/bdpm.js';
import { downloadCalendar, armoireText } from '../lib/calendar.js';
import { Segmented, Empty } from './Common.jsx';
import FicheMedicale from './FicheMedicale.jsx';
import { Trash, Plus, Alert, Box, Edit, Clock, Share } from '../lib/icons.jsx';

const CATEGORIES = [
  ['douleur', 'Douleur'], ['fievre', 'Fièvre'], ['digestion', 'Digestion'], ['allergie', 'Allergie'],
  ['ordonnance', 'Ordonnance'], ['soin', 'Soin, crème'], ['complement', 'Complément'], ['autre', 'Autre'],
];
const CAT_LABEL = Object.fromEntries(CATEGORIES);
const SLOTS = [['matin', 'Matin'], ['midi', 'Midi'], ['soir', 'Soir']];
const EMPTY = { name: '', category: 'autre', quantity: 1, expirationDate: '', notes: '' };

export default function ArmoireSection({ sub, active }) {
  const shown = useRef(sub);
  if (active) shown.current = sub;
  const view = shown.current === 'fiche' ? 'fiche' : 'medicaments';

  const [items, setItems] = useState(loadArmoire);
  const [form, setForm] = useState(null);       // null = fermé ; sinon { ...champs, id? }
  const [confirm, setConfirm] = useState(null); // identifiant en attente de confirmation de suppression

  // L'armoire reste affichée en arrière-plan : elle se met à jour quand un autre écran y ajoute un produit.
  useEffect(() => onArmoireChange(() => setItems(loadArmoire())), []);

  // Ruptures et tensions officielles (ANSM) sur les médicaments de l'armoire
  const [dispo, setDispo] = useState({});
  const [flash, setFlash] = useState('');
  const cisList = items.map((it) => it.cis).filter(Boolean).join(',');
  useEffect(() => {
    let stale = false;
    Promise.all(cisList.split(',').filter(Boolean).map((cis) => getFiche(cis).then((f) => [cis, f && (f.disponibilite || []).find((d) => d.code === 1 || d.code === 2)]).catch(() => [cis, null])))
      .then((pairs) => { if (!stale) setDispo(Object.fromEntries(pairs.filter(([, d]) => d))); });
    return () => { stale = true; };
  }, [cisList]);

  const say = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 4000); };

  function exportCalendar() {
    const n = downloadCalendar(items);
    say(n ? `${n} rappel${n > 1 ? 's' : ''} prêt${n > 1 ? 's' : ''} : ouvrez le fichier pour l'ajouter à votre agenda.` : 'Rien à exporter : renseignez une date de péremption ou cochez une prise.');
  }

  async function shareList() {
    const text = armoireText(items);
    if (navigator.share) { try { await navigator.share({ title: 'Mes médicaments', text }); return; } catch { /* annulé → copie */ } }
    try { await navigator.clipboard.writeText(text); say('Liste copiée.'); } catch { say('Copie impossible sur ce navigateur.'); }
  }

  const tensions = Object.keys(dispo).length;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(), category: form.category,
      quantity: Math.min(999, Math.max(1, parseInt(form.quantity, 10) || 1)),
      expirationDate: form.expirationDate, notes: form.notes.trim(),
    };
    if (form.id) updateMed(form.id, data); else addMed(data);
    setForm(null);
  }

  const expired = items.filter((m) => isExpired(m.expirationDate));
  const soon = items.filter((m) => isExpiringSoon(m.expirationDate));

  return (
    <section>
      <h1 className="title">Armoire à pharmacie</h1>
      <p className="lead">Vos médicaments, leurs dates de péremption et vos prises de la journée. Tout reste sur cet appareil.</p>

      <Segmented label="Contenu" value={view} options={[['medicaments', 'Médicaments'], ['fiche', "Fiche d'urgence"]]}
        onChange={(v) => navigate(v === 'fiche' ? 'armoire/fiche' : 'armoire', { replace: true })} />

      <div hidden={view !== 'fiche'}><FicheMedicale /></div>

      <div hidden={view !== 'medicaments'}>
        {expired.length > 0 && (
          <div className="notice danger"><Alert size={17} />
            <p><b>{expired.length} produit{expired.length > 1 ? 's' : ''} périmé{expired.length > 1 ? 's' : ''}.</b> Rapportez-{expired.length > 1 ? 'les' : 'le'} en pharmacie : ne {expired.length > 1 ? 'les' : 'le'} jetez pas à la poubelle.</p>
          </div>
        )}
        {soon.length > 0 && (
          <div className="notice warn"><Alert size={17} />
            <p><b>{soon.length} produit{soon.length > 1 ? 's' : ''}</b> arrive{soon.length > 1 ? 'nt' : ''} à péremption dans les 30 jours.</p>
          </div>
        )}

        {tensions > 0 && (
          <div className="notice warn"><Alert size={17} />
            <p><b>{tensions} médicament{tensions > 1 ? 's' : ''} de votre armoire</b> {tensions > 1 ? 'font' : 'fait'} l'objet d'une rupture ou d'une tension signalée par l'ANSM. Anticipez le renouvellement avec votre pharmacien.</p>
          </div>
        )}

        {form ? (
          <form className="card" onSubmit={save}>
            <h2 className="h3 mb">{form.id ? 'Modifier le produit' : 'Ajouter un produit'}</h2>
            <div className="form-group">
              <label className="label" htmlFor="arm-name">Nom</label>
              <input id="arm-name" className="input" required autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Doliprane 1000 mg" />
            </div>
            <div className="form-group">
              <span className="label">Catégorie</span>
              <div className="chips">
                {CATEGORIES.map(([id, label]) => (
                  <button key={id} type="button" className="chip" aria-pressed={form.category === id} onClick={() => set('category', id)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="label" htmlFor="arm-qty">Quantité</label>
                <input id="arm-qty" className="input" type="number" inputMode="numeric" min="1" max="999" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="arm-exp">Péremption</label>
                <input id="arm-exp" className="input" type="date" value={form.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="label" htmlFor="arm-notes">Notes</label>
              <textarea id="arm-notes" className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="À prendre pendant le repas" />
            </div>
            <div className="inline">
              <button type="button" className="btn btn-outline grow" onClick={() => setForm(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary grow">{form.id ? 'Enregistrer' : 'Ajouter'}</button>
            </div>
          </form>
        ) : (
          <button className="btn btn-accent-outline btn-block mb" onClick={() => setForm({ ...EMPTY })}><Plus size={18} /> Ajouter un produit</button>
        )}

        {items.length === 0 && !form && (
          <Empty icon={<Box size={26} />} title="Votre armoire est vide">
            <p>Ajoutez un produit à la main, ou depuis la fiche d'un médicament après l'avoir scanné.</p>
            <button className="btn btn-primary mt" onClick={() => navigate('medicaments')}>Scanner un médicament</button>
          </Empty>
        )}

        {items.map((it) => {
          const out = isExpired(it.expirationDate), near = isExpiringSoon(it.expirationDate);
          return (
            <article key={it.id} className={'item' + (out ? ' expired' : near ? ' soon' : '')}>
              <div className="head">
                <div className="grow" style={{ flex: 1, minWidth: 0 }}>
                  <h2 className="h3" style={{ overflowWrap: 'anywhere' }}>{it.name}</h2>
                  <div className="tags mt-s">
                    <span className="tag neutral">{CAT_LABEL[it.category] || 'Autre'}</span>
                    {it.quantity > 1 && <span className="tag neutral num">× {it.quantity}</span>}
                    {dispo[it.cis] && <span className="tag warn">{dispo[it.cis].statut}</span>}
                    {it.expirationDate && (
                      <span className={'tag num ' + (out ? 'danger' : near ? 'warn' : 'ok')}>
                        {out ? 'Périmé depuis le' : 'Périme le'} {formatDate(it.expirationDate)}
                      </span>
                    )}
                  </div>
                </div>
                <button className="icon-btn plain" aria-label={`Modifier ${it.name}`}
                  onClick={() => { setForm({ id: it.id, name: it.name, category: it.category || 'autre', quantity: it.quantity || 1, expirationDate: it.expirationDate || '', notes: it.notes || '' }); window.scrollTo({ top: 0 }); }}>
                  <Edit size={18} />
                </button>
                <button className="icon-btn plain" aria-label={`Supprimer ${it.name}`} onClick={() => setConfirm(it.id)}><Trash size={18} /></button>
              </div>

              {confirm === it.id && (
                <div className="inline mt-s">
                  <button className="btn btn-outline btn-sm grow" onClick={() => setConfirm(null)}>Garder</button>
                  <button className="btn btn-danger btn-sm grow" onClick={() => { removeMed(it.id); setConfirm(null); }}>Supprimer</button>
                </div>
              )}

              {it.notes && <p className="meta mt-s">{it.notes}</p>}
              {it.cis && <button className="btn btn-quiet" onClick={() => navigate(`medicaments/${it.cis}`)}>Voir la fiche officielle</button>}

              <p className="label" style={{ margin: '10px 0 0' }}>Prises de la journée</p>
              <div className="slots">
                {SLOTS.map(([key, label]) => (
                  <button key={key} aria-pressed={!!it.reminders[key]} onClick={() => toggleReminder(it.id, key)}>{label}</button>
                ))}
              </div>
            </article>
          );
        })}

        {items.length > 0 && (
          <>
            <div className="stack mt">
              <button className="btn btn-outline" onClick={exportCalendar}><Clock size={18} /> Recevoir les rappels dans mon agenda</button>
              <button className="btn btn-outline" onClick={shareList}><Share size={18} /> Partager ma liste de médicaments</button>
            </div>
            {flash && <p className="notice ok mt-s" role="status" style={{ marginBottom: 0 }}>{flash}</p>}
            <p className="small mt">L'agenda de votre téléphone vous alerte 30 jours avant chaque péremption et à l'heure des prises cochées (8 h, 12 h 30, 20 h). Rien n'est envoyé à un serveur.</p>
          </>
        )}
      </div>
    </section>
  );
}

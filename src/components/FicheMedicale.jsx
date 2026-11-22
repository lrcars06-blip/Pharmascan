import { useState } from 'react';
import { loadFiche, saveFiche, formatDate } from '../lib/storage.js';
import { Edit, Share, Check } from '../lib/icons.jsx';

const SANG = ['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
const LIENS = ['', 'Conjoint(e)', 'Parent', 'Enfant', 'Frère ou sœur', 'Ami(e)', 'Médecin', 'Autre'];

function Field({ label, id, children }) {
  return <div className="form-group"><label className="label" htmlFor={id}>{label}</label>{children}</div>;
}

export default function FicheMedicale() {
  const [fiche, setFiche] = useState(loadFiche);
  const [draft, setDraft] = useState(null); // null = lecture ; sinon brouillon en cours de modification
  const [copied, setCopied] = useState(false);

  const isEmpty = !Object.values(fiche).some(Boolean);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const nom = [fiche.prenom, fiche.nom].filter(Boolean).join(' ');

  function save(e) {
    e.preventDefault();
    saveFiche(draft);
    setFiche(draft);
    setDraft(null);
  }

  function texte() {
    const l = ["FICHE MÉDICALE D'URGENCE"];
    if (nom) l.push(nom);
    if (fiche.dateNaissance) l.push(`Né(e) le ${formatDate(fiche.dateNaissance)}`);
    if (fiche.groupeSanguin) l.push(`Groupe sanguin : ${fiche.groupeSanguin}`);
    if (fiche.adresse) l.push(`Adresse : ${fiche.adresse}`);
    if (fiche.contactNom || fiche.contactTel) {
      l.push('', 'PERSONNE À PRÉVENIR');
      if (fiche.contactNom) l.push(`${fiche.contactNom}${fiche.contactLien ? ` (${fiche.contactLien})` : ''}`);
      if (fiche.contactTel) l.push(`Tél. ${fiche.contactTel}`);
    }
    if (fiche.allergies) l.push('', 'ALLERGIES', fiche.allergies);
    if (fiche.traitements) l.push('', 'TRAITEMENTS EN COURS', fiche.traitements);
    if (fiche.antecedents) l.push('', 'ANTÉCÉDENTS', fiche.antecedents);
    if (fiche.notes) l.push('', 'NOTES', fiche.notes);
    return l.join('\n');
  }

  async function share() {
    const text = texte();
    if (navigator.share) {
      try { await navigator.share({ title: 'Ma fiche médicale', text }); return; } catch { /* partage annulé → copie */ }
    }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* presse-papiers refusé */ }
  }

  if (draft) {
    return (
      <form className="card" onSubmit={save}>
        <h2 className="h3 mb">Fiche médicale d'urgence</h2>
        <div className="form-row">
          <Field label="Prénom" id="fm-prenom"><input id="fm-prenom" className="input" autoComplete="given-name" value={draft.prenom} onChange={set('prenom')} /></Field>
          <Field label="Nom" id="fm-nom"><input id="fm-nom" className="input" autoComplete="family-name" value={draft.nom} onChange={set('nom')} /></Field>
        </div>
        <div className="form-row">
          <Field label="Date de naissance" id="fm-naissance"><input id="fm-naissance" className="input" type="date" value={draft.dateNaissance} onChange={set('dateNaissance')} /></Field>
          <Field label="Groupe sanguin" id="fm-sang">
            <select id="fm-sang" className="select" value={draft.groupeSanguin} onChange={set('groupeSanguin')}>
              {SANG.map((s) => <option key={s} value={s}>{s || 'Non renseigné'}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Adresse" id="fm-adresse"><input id="fm-adresse" className="input" autoComplete="street-address" value={draft.adresse} onChange={set('adresse')} /></Field>

        <h3 className="h3" style={{ margin: '18px 0 10px' }}>Personne à prévenir</h3>
        <div className="form-row">
          <Field label="Nom et prénom" id="fm-cnom"><input id="fm-cnom" className="input" value={draft.contactNom} onChange={set('contactNom')} /></Field>
          <Field label="Lien" id="fm-clien">
            <select id="fm-clien" className="select" value={draft.contactLien} onChange={set('contactLien')}>
              {LIENS.map((l) => <option key={l} value={l}>{l || 'Non renseigné'}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Téléphone" id="fm-ctel"><input id="fm-ctel" className="input" type="tel" inputMode="tel" value={draft.contactTel} onChange={set('contactTel')} placeholder="06 00 00 00 00" /></Field>

        <h3 className="h3" style={{ margin: '18px 0 10px' }}>Informations médicales</h3>
        <Field label="Allergies" id="fm-allergies"><textarea id="fm-allergies" className="textarea" value={draft.allergies} onChange={set('allergies')} placeholder="Pénicilline, arachides" /></Field>
        <Field label="Traitements en cours" id="fm-traitements"><textarea id="fm-traitements" className="textarea" value={draft.traitements} onChange={set('traitements')} placeholder="Nom, dosage, moment de la prise" /></Field>
        <Field label="Antécédents médicaux" id="fm-antecedents"><textarea id="fm-antecedents" className="textarea" value={draft.antecedents} onChange={set('antecedents')} /></Field>
        <Field label="Notes" id="fm-notes"><textarea id="fm-notes" className="textarea" value={draft.notes} onChange={set('notes')} placeholder="Pacemaker, implant, lentilles" /></Field>

        <div className="inline">
          <button type="button" className="btn btn-outline grow" onClick={() => setDraft(null)}>Annuler</button>
          <button type="submit" className="btn btn-primary grow">Enregistrer</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="urgence">
        <div className="inline" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="cap">Fiche médicale d'urgence</div>
            {nom && <div className="h2" style={{ marginTop: 4 }}>{nom}</div>}
            {fiche.dateNaissance && <div style={{ fontSize: 14, opacity: 0.9, marginTop: 2 }}>Né(e) le {formatDate(fiche.dateNaissance)}</div>}
          </div>
          {fiche.groupeSanguin && <div className="blood"><span className="cap">Groupe</span><b>{fiche.groupeSanguin}</b></div>}
        </div>

        {isEmpty ? (
          <p style={{ marginTop: 10, opacity: 0.9 }}>Renseignez vos allergies, vos traitements et la personne à prévenir : en cas d'urgence, tout est au même endroit.</p>
        ) : (
          <div style={{ marginTop: 10 }}>
            {(fiche.contactNom || fiche.contactTel) && (
              <div className="line">
                <div className="cap">Personne à prévenir{fiche.contactLien ? `, ${fiche.contactLien.toLowerCase()}` : ''}</div>
                {fiche.contactNom && <div style={{ fontWeight: 600 }}>{fiche.contactNom}</div>}
                {fiche.contactTel && <a href={`tel:${fiche.contactTel.replace(/[^\d+]/g, '')}`}>{fiche.contactTel}</a>}
              </div>
            )}
            {fiche.allergies && <Line label="Allergies" value={fiche.allergies} alert />}
            {fiche.traitements && <Line label="Traitements en cours" value={fiche.traitements} />}
            {fiche.antecedents && <Line label="Antécédents" value={fiche.antecedents} />}
            {fiche.adresse && <Line label="Adresse" value={fiche.adresse} />}
            {fiche.notes && <Line label="Notes" value={fiche.notes} />}
          </div>
        )}
      </div>

      <div className="inline mt">
        <button className="btn btn-outline grow" onClick={() => setDraft(fiche)}><Edit size={17} /> {isEmpty ? 'Remplir ma fiche' : 'Modifier'}</button>
        {!isEmpty && (
          <button className="btn btn-primary grow" onClick={share}>
            {copied ? <><Check size={17} /> Copiée</> : <><Share size={17} /> Partager</>}
          </button>
        )}
      </div>
      <p className="small mt">Ces informations restent sur cet appareil. « Partager » produit un texte à coller dans une note, un message ou votre fiche médicale Apple Santé.</p>
    </div>
  );
}

function Line({ label, value, alert }) {
  return (
    <div className={'line' + (alert ? ' alert' : '')}>
      <div className="cap">{label}</div>
      <div style={{ whiteSpace: 'pre-line' }}>{value}</div>
    </div>
  );
}

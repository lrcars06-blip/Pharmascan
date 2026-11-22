import { useEffect, useState } from 'react';
import { getFiche, getGroupe, substancesOf, noticeUrl } from '../lib/bdpm.js';
import { addMed, hasMed, pushRecent, formatDate } from '../lib/storage.js';
import { Disclaimer, Empty } from './Common.jsx';
import { Shield, FileText, Plus, Check, ChevronLeft, Chevron, Help, Alert } from '../lib/icons.jsx';

const euros = (n) => n.toFixed(2).replace('.', ',') + ' €';
const DISPO = { 1: 'danger', 2: 'warn', 3: 'neutral', 4: 'ok' }; // rupture, tension, arrêt, remise à disposition

export default function MedFiche({ cis, scan, meta, onBack, onOpen, onSeen }) {
  const [state, setState] = useState({ status: 'loading' });
  const [groupe, setGroupe] = useState(null);     // null | 'loading' | { libelle, membres }
  const [allPres, setAllPres] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let stale = false;
    setState({ status: 'loading' }); setGroupe(null); setAllPres(false); setAdded(hasMed(cis));
    window.scrollTo(0, 0);
    getFiche(cis)
      .then((f) => {
        if (stale) return;
        setState(f ? { status: 'ready', fiche: f } : { status: 'notfound' });
        if (f) onSeen(pushRecent(f.cis, f.nom));
      })
      .catch(() => { if (!stale) setState({ status: 'error' }); });
    return () => { stale = true; };
  }, [cis]);

  const back = <button className="back" onClick={onBack}><ChevronLeft size={16} /> Retour</button>;

  if (state.status === 'loading') {
    return <section>{back}<div className="skeleton" style={{ height: 340 }} aria-busy="true" /></section>;
  }
  if (state.status !== 'ready') {
    return (
      <section>{back}
        {state.status === 'notfound'
          ? <Empty icon={<Help size={26} />} title="Fiche introuvable"><p>Ce médicament n'existe pas, ou plus, dans la base officielle.</p></Empty>
          : <Empty icon={<Alert size={26} />} title="Fiche inaccessible"><p>Vérifiez votre connexion, puis réessayez.</p></Empty>}
      </section>
    );
  }

  const f = state.fiche;
  const substances = substancesOf(f);
  const pres = f.presentations || [];
  const shownPres = allPres ? pres : pres.slice(0, 4);
  const date = meta ? formatDate(meta.genere_le) : '';

  function add() {
    addMed({ id: f.cis, cis: f.cis, name: f.nom, substance: substances.join(', '), expirationDate: scan?.peremption || '' });
    setAdded(true);
  }

  async function showGroupe() {
    setGroupe('loading');
    setGroupe((await getGroupe(f.groupe.id)) || { libelle: f.groupe.libelle, membres: [] });
  }

  return (
    <section className="appear">
      {back}
      <article className="card">
        <div className="tags">
          {scan && <span className="tag ok"><Check size={13} sw={3} /> Identifié par scan</span>}
          <span className={'tag ' + (f.commercialise ? 'ok' : 'neutral')}>{f.commercialise ? 'Commercialisé' : 'Non commercialisé'}</span>
          {f.amm && !/active/i.test(f.amm) && <span className="tag warn">{f.amm}</span>}
          {f.surveillance === 1 && <span className="tag warn">Surveillance renforcée</span>}
        </div>

        <h1 className="h2" style={{ marginTop: 12 }}>{f.nom}</h1>
        <p className="meta" style={{ marginTop: 4 }}>
          {[f.voies && `Voie ${f.voies}`, f.titulaire].filter(Boolean).join(' — ')}
        </p>

        <dl className="facts">
          {substances.length > 0 && (
            <div className="fact">
              <dt>Substance{substances.length > 1 ? 's' : ''} active{substances.length > 1 ? 's' : ''} et dosage</dt>
              {substances.slice(0, 8).map((s) => <dd key={s}>{s}</dd>)}
              {substances.length > 8 && <dd className="meta">et {substances.length - 8} autres (voir la notice)</dd>}
            </div>
          )}

          {pres.length > 0 && (
            <div className="fact">
              <dt>Boîtes, prix et remboursement</dt>
              <dd>
                {shownPres.map((p) => (
                  <div key={p.cip13} className={'pres' + (scan?.cip13 === p.cip13 ? ' scanned' : '')}>
                    <div className="what">
                      <div>{p.libelle}</div>
                      <div className="small num">
                        CIP {p.cip13}{p.taux ? `, remboursé à ${p.taux}` : ''}{p.commercialisee ? '' : ', plus commercialisée'}
                      </div>
                    </div>
                    <div className="price num">{p.prix != null ? euros(p.prix) : <span className="small">Prix non fixé</span>}</div>
                  </div>
                ))}
                {pres.length > shownPres.length && (
                  <button className="btn btn-quiet" onClick={() => setAllPres(true)}>Afficher les {pres.length - shownPres.length} autres boîtes</button>
                )}
                <p className="small mt-s">{pres.some((p) => p.prix != null) ? 'Prix public réglementé, honoraire de dispensation inclus. ' : ''}{pres.some((p) => p.prix == null) ? '« Prix non fixé » : la base officielle ne fixe pas de tarif (médicament non remboursable ou réservé à l\'hôpital).' : ''}</p>
              </dd>
            </div>
          )}

          <div className="fact">
            <dt>Disponibilité</dt>
            {f.disponibilite ? f.disponibilite.map((d, i) => (
              <dd key={i}>
                <span className={'tag ' + (DISPO[d.code] || 'neutral')}>{d.statut}</span>
                <p className="small mt-s">
                  {d.debut && `Depuis le ${d.debut}. `}{d.remise && `Remise à disposition le ${d.remise}. `}{d.maj && `Information mise à jour le ${d.maj}. `}
                  {d.lien && <a href={d.lien} target="_blank" rel="noreferrer">Détails sur le site de l'ANSM</a>}
                </p>
              </dd>
            )) : (
              <dd className="meta">Aucune rupture ni tension d'approvisionnement signalée par l'ANSM{date ? ` au ${date}` : ''}. Cela ne garantit pas le stock de votre pharmacie.</dd>
            )}
          </div>

          {f.conditions?.length > 0 && (
            <div className="fact">
              <dt>Conditions de délivrance</dt>
              {f.conditions.map((c) => <dd key={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</dd>)}
            </div>
          )}

          {f.groupe && (
            <div className="fact">
              <dt>Générique</dt>
              <dd>{f.groupe.type || 'Membre'} du groupe « {f.groupe.libelle} »</dd>
              {groupe === null && <dd><button className="btn btn-quiet" onClick={showGroupe}>Voir les médicaments équivalents</button></dd>}
              {groupe === 'loading' && <dd><div className="skeleton" style={{ height: 80 }} /></dd>}
              {groupe && groupe !== 'loading' && (
                <dd>
                  <div className="rows" style={{ margin: '4px -4px 0' }}>
                    {groupe.membres.filter((m) => m.cis !== f.cis && m.commercialise).slice(0, 30).map((m) => (
                      <button key={m.cis} className="row" style={{ padding: '10px 4px' }} onClick={() => onOpen(m.cis)}>
                        <div className="body"><div className="name" style={{ fontWeight: 500 }}>{m.nom}</div></div>
                        {m.type === 0 && <span className="tag info">Princeps</span>}
                        <Chevron size={16} className="chev" />
                      </button>
                    ))}
                  </div>
                  <p className="small mt-s">Même substance active, même dosage, même forme. Votre pharmacien peut vous proposer la substitution.</p>
                </dd>
              )}
            </div>
          )}

          <div className="fact">
            <dt>Posologie et précautions</dt>
            <dd className="meta">Elles figurent dans la notice officielle. Suivez la notice et l'avis de votre médecin ou de votre pharmacien.</dd>
          </div>
        </dl>

        <div className="stack mt">
          <a className="btn btn-primary" href={noticeUrl(f.cis)} target="_blank" rel="noreferrer"><FileText size={18} /> Lire la notice officielle</a>
          {added
            ? <button className="btn btn-soft" disabled><Check size={18} /> Dans mon armoire</button>
            : <button className="btn btn-accent-outline" onClick={add}><Plus size={18} /> Ajouter à mon armoire</button>}
          {scan?.peremption && <p className="small" style={{ textAlign: 'center' }}>Péremption lue sur la boîte : {formatDate(scan.peremption)}{scan.lot ? `, lot ${scan.lot}` : ''}. Elle sera enregistrée dans l'armoire.</p>}
        </div>

        <p className="small inline mt" style={{ gap: 6 }}>
          <Shield size={14} /> <span>Source : base de données publique des médicaments (ANSM){date ? `, données du ${date}` : ''}. Code CIS {f.cis}.</span>
        </p>
      </article>
      <Disclaimer />
    </section>
  );
}

import { useDeferredValue, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { searchMedicaments, getFicheByCip, loadMeta } from '../lib/bdpm.js';
import { parseCode } from '../lib/codes.js';
import { loadRecents, formatDate } from '../lib/storage.js';
import { navigate, goBack } from '../lib/route.js';
import { Empty } from './Common.jsx';
import MedFiche from './MedFiche.jsx';
import { Scan, Search, Close, Chevron, Help, Alert, Clock } from '../lib/icons.jsx';

const BarcodeScanner = lazy(() => import('./BarcodeScanner.jsx'));
const EXEMPLES = ['Doliprane', 'Ibuprofène', 'Amoxicilline', 'Spasfon'];
const isCode = (q) => /^[\d\s.\-]{7,}$/.test(q);

export default function MedSection({ sub, active }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [results, setResults] = useState(null);       // { total, items, corrige }
  const [base, setBase] = useState('idle');           // idle | loading | ready | error
  const [code, setCode] = useState(null);             // null | { kind: 'loading' | 'ean' | 'introuvable' | 'illisible' | 'erreur', value }
  const [scanning, setScanning] = useState(false);
  const [recents, setRecents] = useState(loadRecents);
  const [meta, setMeta] = useState(null);
  const [attempt, setAttempt] = useState(0);         // « Réessayer » relance la recherche
  const scan = useRef(null);                          // ce que le scan a lu : { cis, cip13, peremption, lot }
  const inputRef = useRef(null);

  // Sous-route : l'onglet garde sa fiche ouverte quand on passe sur un autre onglet.
  const shown = useRef(sub);
  if (active) shown.current = sub;
  const cis = /^\d{8}$/.test(shown.current || '') ? shown.current : null;

  useEffect(() => { loadMeta().then(setMeta).catch(() => {}); }, []);

  // Lien direct par code CIP 7 (#/medicaments/3595583), utilisé depuis l'onglet parapharmacie.
  useEffect(() => {
    if (active && /^\d{7}$/.test(sub || '')) resolveCip({ cip7: sub, cip13: '' }, true);
  }, [active, sub]);

  // Recherche au fil de la frappe : la base est dans le navigateur, la réponse est immédiate.
  useEffect(() => {
    const q = deferred.trim();
    if (q.length < 2 || isCode(q)) { setResults(null); return undefined; }
    let stale = false;
    setBase((s) => (s === 'ready' ? s : 'loading'));
    searchMedicaments(q)
      .then((r) => { if (!stale) { setResults(r); setBase('ready'); } })
      .catch(() => { if (!stale) setBase('error'); });
    return () => { stale = true; };
  }, [deferred, attempt]);

  async function resolveCip(c, replace = false) {
    setCode({ kind: 'loading' });
    try {
      const fiche = await getFicheByCip(c.cip7);
      if (!fiche) return setCode({ kind: 'introuvable', value: c.cip13 || c.cip7 });
      scan.current = { cis: fiche.cis, cip13: c.cip13, peremption: c.peremption || '', lot: c.lot || '' };
      setCode(null);
      navigate(`medicaments/${fiche.cis}`, { replace });
    } catch { setCode({ kind: 'erreur' }); }
  }

  function handleCode(raw) {
    const c = parseCode(raw);
    if (c.type === 'cip') return resolveCip(c);
    if (c.type === 'ean') return setCode({ kind: 'ean', value: c.ean });
    if (c.type === 'texte') return setCode({ kind: 'illisible' });
    return setCode({ kind: 'introuvable', value: raw });
  }

  function submit(e) {
    e.preventDefault();
    const q = query.trim();
    if (isCode(q)) handleCode(q);
    inputRef.current?.blur();
  }

  function change(v) {
    setQuery(v);
    if (code) setCode(null);
  }

  function open(id) {
    scan.current = null;
    navigate(`medicaments/${id}`);
  }

  if (cis) {
    return (
      <MedFiche
        cis={cis}
        scan={scan.current && scan.current.cis === cis ? scan.current : null}
        meta={meta}
        onOpen={open}
        onSeen={setRecents}
        onBack={() => goBack('medicaments')}
      />
    );
  }

  const q = deferred.trim();
  const typing = q.length >= 2 && !isCode(q);

  return (
    <section>
      <h1 className="title">Quel est ce médicament ?</h1>
      <p className="lead">Scannez la boîte ou tapez son nom pour lire l'information officielle.</p>

      <button className="btn btn-primary btn-hero btn-block mb" onClick={() => setScanning(true)}>
        <Scan size={24} /> Scanner la boîte
      </button>

      {scanning && (
        <Suspense fallback={null}>
          <BarcodeScanner title="Scanner un médicament" hint="Visez le petit carré (DataMatrix) ou le code-barres de la boîte."
            onDetected={(raw) => { setScanning(false); setQuery(''); handleCode(raw); }}
            onClose={() => setScanning(false)} />
        </Suspense>
      )}

      <form className="search" role="search" onSubmit={submit}>
        <Search size={19} />
        <input ref={inputRef} className="input" type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck="false"
          placeholder="Nom, substance ou code CIP" aria-label="Rechercher un médicament"
          value={query} onChange={(e) => change(e.target.value)} />
        {query && <button type="button" className="clear" aria-label="Effacer" onClick={() => { change(''); inputRef.current?.focus(); }}><Close size={18} /></button>}
      </form>

      {/* --- Code saisi ou scanné --- */}
      {isCode(query.trim()) && !code && (
        <button className="btn btn-outline btn-block mt" onClick={submit}>Chercher le code {query.trim()}</button>
      )}
      {code?.kind === 'loading' && <div className="skeleton mt" style={{ height: 120 }} />}
      {code?.kind === 'ean' && (
        <Empty icon={<Scan size={26} />} title="Ce code n'est pas celui d'un médicament">
          <p>Le code <span className="code">{code.value}</span> est un code-barres de produit courant. Les médicaments portent un code CIP qui commence par 3400.</p>
          <div className="stack mt">
            <button className="btn btn-primary" onClick={() => navigate(`parapharmacie/${code.value}`)}>Chercher en parapharmacie</button>
            <button className="btn btn-outline" onClick={() => { setCode(null); inputRef.current?.focus(); }}>Chercher par nom</button>
          </div>
        </Empty>
      )}
      {code?.kind === 'introuvable' && (
        <Empty icon={<Help size={26} />} title="Code absent de la base officielle">
          <p>Le code <span className="code">{code.value}</span> n'existe pas dans la BDPM. Il peut s'agir d'un médicament étranger ou d'un code mal lu.</p>
          <div className="stack mt">
            <button className="btn btn-primary" onClick={() => setScanning(true)}>Scanner à nouveau</button>
            <button className="btn btn-outline" onClick={() => { setCode(null); setQuery(''); inputRef.current?.focus(); }}>Chercher par nom</button>
          </div>
        </Empty>
      )}
      {code?.kind === 'illisible' && (
        <Empty icon={<Help size={26} />} title="Ce code n'identifie pas un médicament">
          <p>Visez le petit carré noir et blanc (DataMatrix) ou le code-barres imprimé sur la boîte.</p>
          <button className="btn btn-primary mt" onClick={() => setScanning(true)}>Scanner à nouveau</button>
        </Empty>
      )}
      {(code?.kind === 'erreur' || (typing && base === 'error')) && (
        <Empty icon={<Alert size={26} />} title="Base des médicaments inaccessible">
          <p>Vérifiez votre connexion, puis réessayez.</p>
          <button className="btn btn-primary mt" onClick={() => { setCode(null); setBase('idle'); setAttempt((n) => n + 1); }}>Réessayer</button>
        </Empty>
      )}

      {/* --- Résultats au fil de la frappe --- */}
      {typing && base === 'loading' && !results && (
        <div className="mt" aria-busy="true">
          <p className="count">Chargement de la base officielle…</p>
          <div className="skeleton" style={{ height: 180 }} />
        </div>
      )}
      {typing && results && !code && (
        results.total === 0 ? (
          <Empty icon={<Help size={26} />} title="Aucun médicament trouvé">
            <p>Rien dans la base officielle pour « {q} ». Vérifiez l'orthographe ou essayez la substance active, par exemple « paracétamol ».</p>
          </Empty>
        ) : (
          <>
            <p className="count" role="status">
              {results.corrige && <>Aucun résultat pour « {q} ». Résultats pour « {results.corrige} » : </>}
              {results.total} médicament{results.total > 1 ? 's' : ''}
              {results.total > results.items.length ? `, les ${results.items.length} premiers affichés. Précisez le dosage ou la forme.` : ''}
            </p>
            <div className="card flush results">
              <div className="rows">
                {results.items.map((m) => (
                  <button key={m.cis} className={'row' + (m.commercialise ? '' : ' dim')} onClick={() => open(m.cis)}>
                    <div className="body">
                      <div className="name">{m.nom}</div>
                      <div className="sub">{m.titulaire}{m.commercialise ? '' : ' — non commercialisé'}</div>
                    </div>
                    <Chevron size={17} className="chev" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )
      )}

      {/* --- Écran de départ --- */}
      {!typing && !code && !isCode(query.trim()) && (
        <>
          <div className="chips mt">
            {EXEMPLES.map((c) => <button key={c} className="chip" onClick={() => change(c)}>{c}</button>)}
          </div>
          {recents.length > 0 && (
            <>
              <p className="count" style={{ marginTop: 22 }}>Consultés récemment</p>
              <div className="card flush">
                <div className="rows">
                  {recents.map((r) => (
                    <button key={r.cis} className="row" onClick={() => open(r.cis)}>
                      <Clock size={17} className="chev" />
                      <div className="body"><div className="name">{r.nom}</div></div>
                      <Chevron size={17} className="chev" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {meta && (
            <p className="small" style={{ marginTop: 22 }}>
              {meta.specialites.toLocaleString('fr-FR')} médicaments, issus de la base de données publique des médicaments (ANSM). Données du {formatDate(meta.genere_le)}, consultables hors ligne.
            </p>
          )}
        </>
      )}
    </section>
  );
}

import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { searchParapharmacie } from '../lib/api.js';
import { parseCode } from '../lib/codes.js';
import { navigate } from '../lib/route.js';
import { Segmented, Empty } from './Common.jsx';
import ConseilIA from './ConseilIA.jsx';
import { Scan, Shield, Help, Alert, Pill } from '../lib/icons.jsx';

const BarcodeScanner = lazy(() => import('./BarcodeScanner.jsx'));
const clean = (tags) => (tags || []).map((t) => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '));
const euros = (v) => v.toFixed(2).replace('.', ',') + ' €';

export default function ParaSection({ sub, active }) {
  const shown = useRef(sub);
  if (active) shown.current = sub;
  const view = shown.current === 'conseil' ? 'conseil' : 'scan';

  const [code, setCode] = useState('');
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | found | notfound | invalid | medicament | error
  const [scanning, setScanning] = useState(false);
  const [conseilOpened, setConseilOpened] = useState(view === 'conseil');
  if (view === 'conseil' && !conseilOpened) setConseilOpened(true);
  const seq = useRef(0);

  async function search(raw) {
    const c = parseCode(raw);
    if (c.type === 'empty') return setState({ status: 'idle' });
    // Code de médicament : on ouvre directement sa fiche officielle.
    if (c.type === 'cip') { setState({ status: 'idle' }); setCode(''); return navigate(`medicaments/${c.cip7}`); }
    if (c.type !== 'ean') return setState({ status: 'invalid' });
    const id = ++seq.current;
    setState({ status: 'loading' });
    try {
      const product = await searchParapharmacie(c.ean);
      if (id !== seq.current) return;
      setState(product ? { status: 'found', product } : { status: 'notfound', code: c.ean });
    } catch {
      if (id === seq.current) setState({ status: 'error' });
    }
  }

  // Lien direct (#/parapharmacie/3337875597197), utilisé depuis l'onglet médicaments.
  useEffect(() => {
    if (active && /^\d{8,14}$/.test(sub || '')) { setCode(sub); search(sub); }
  }, [active, sub]);

  const p = state.product;
  const allergenes = p ? clean(p.allergens_tags) : [];
  const ingredients = p ? (p.ingredients_text_fr || p.ingredients_text || '') : '';

  return (
    <section>
      <h1 className="title">Parapharmacie</h1>
      <p className="lead">Scannez un produit pour lire sa composition, ou décrivez votre besoin à l'assistant.</p>

      <Segmented label="Mode" value={view} options={[['scan', 'Scanner un produit'], ['conseil', 'Assistant conseil']]}
        onChange={(v) => navigate(v === 'conseil' ? 'parapharmacie/conseil' : 'parapharmacie', { replace: true })} />

      {conseilOpened && <div hidden={view !== 'conseil'}><ConseilIA /></div>}

      <div hidden={view !== 'scan'}>
        <button className="btn btn-primary btn-hero btn-block mb" onClick={() => setScanning(true)}>
          <Scan size={24} /> Scanner un produit
        </button>

        {scanning && (
          <Suspense fallback={null}>
            <BarcodeScanner title="Scanner un produit" hint="Placez le code-barres du produit dans le cadre."
              onDetected={(raw) => { setScanning(false); const c = parseCode(raw); setCode(c.ean || c.cip13 || ''); search(raw); }}
              onClose={() => setScanning(false)} />
          </Suspense>
        )}

        <form className="inline" onSubmit={(e) => { e.preventDefault(); search(code); }}>
          <input className="input grow" inputMode="numeric" autoComplete="off" placeholder="Code-barres (8 à 13 chiffres)" aria-label="Code-barres du produit"
            value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn btn-outline" type="submit">Chercher</button>
        </form>

        <div className="mt">
          {state.status === 'idle' && <p className="small">Le code est imprimé sous le code-barres. La recherche couvre les bases ouvertes Open Beauty Facts, Open Food Facts et Open Products Facts.</p>}
          {state.status === 'loading' && <div className="skeleton" style={{ height: 220 }} aria-busy="true" />}

          {state.status === 'invalid' && (
            <Empty icon={<Help size={26} />} title="Code incomplet"><p>Un code-barres compte 8 à 13 chiffres. Vérifiez votre saisie.</p></Empty>
          )}
          {state.status === 'medicament' && (
            <Empty icon={<Pill size={26} />} title="Ce code est celui d'un médicament">
              <p>Les codes qui commencent par 3400 identifient des médicaments.</p>
              <button className="btn btn-primary mt" onClick={() => navigate(`medicaments/${state.cip7}`)}>Voir la fiche du médicament</button>
            </Empty>
          )}
          {state.status === 'notfound' && (
            <Empty icon={<Help size={26} />} title="Produit absent des bases ouvertes">
              <p>Le code <span className="code">{state.code}</span> n'est référencé dans aucune des trois bases. La composition figure sur l'emballage.</p>
              <a className="btn btn-outline mt" href={`https://fr.openbeautyfacts.org/cgi/product.pl?code=${state.code}`} target="_blank" rel="noreferrer">Ajouter ce produit à Open Beauty Facts</a>
            </Empty>
          )}
          {state.status === 'error' && (
            <Empty icon={<Alert size={26} />} title="Recherche impossible pour le moment">
              <p>Vérifiez votre connexion, puis réessayez.</p>
              <button className="btn btn-primary mt" onClick={() => search(code)}>Réessayer</button>
            </Empty>
          )}

          {state.status === 'found' && (
            <article className="card appear">
              <span className="tag info">Produit trouvé</span>
              <h2 className="h2" style={{ marginTop: 12 }}>{p.product_name_fr || p.product_name}</h2>
              {(p.brands || p.quantity) && <p className="meta" style={{ marginTop: 4 }}>{[p.brands, p.quantity].filter(Boolean).join(', ')}</p>}
              <dl className="facts">
                <div className="fact">
                  <dt>Allergènes signalés</dt>
                  <dd>{allergenes.length ? allergenes.join(', ') : <span className="meta">Aucun allergène listé dans la base pour ce produit.</span>}</dd>
                </div>
                <div className="fact">
                  <dt>Ingrédients</dt>
                  <dd style={{ fontSize: 14 }}>{ingredients || <span className="meta">Liste non renseignée dans la base. Consultez l'emballage.</span>}</dd>
                </div>
                {p.prix && (
                  <div className="fact">
                    <dt>Prix constaté</dt>
                    <dd className="num">{p.prix.min === p.prix.max ? euros(p.prix.min) : `${euros(p.prix.min)} à ${euros(p.prix.max)}`}</dd>
                    <dd className="small">Relevés par des contributeurs d'Open Prices{p.prix.date ? `, le plus récent du ${p.prix.date.split('-').reverse().join('/')}` : ''}. Ce n'est pas un prix officiel : il varie selon le point de vente.</dd>
                  </div>
                )}
              </dl>
              <p className="small inline mt" style={{ gap: 6 }}><Shield size={14} /> <span>Source : {p.source}, base collaborative ouverte.</span></p>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

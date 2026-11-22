import { useEffect, useRef, useState } from 'react';
import { searchCommunes, findPharmacies, locate } from '../lib/pharmacies.js';
import { Empty } from './Common.jsx';
import { Phone, Pin, Route, Search, Close, Locate, Alert } from '../lib/icons.jsx';

const itineraire = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
const distance = (km) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1).replace('.', ',')} km`);
const tel = (phone) => (phone || '').split(/[;,/]/)[0].replace(/[^\d+]/g, '');

export default function PharmaSection() {
  const [city, setCity] = useState('');
  const [sugg, setSugg] = useState([]);
  const [hl, setHl] = useState(0);                       // suggestion surlignée au clavier
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | done | error | geo
  const abort = useRef(null);
  const inputRef = useRef(null);

  // Suggestions de communes : la requête précédente est annulée à chaque frappe.
  useEffect(() => {
    const q = city.trim();
    abort.current?.abort();
    if (q.length < 2 || state.label === q) { setSugg([]); return undefined; }
    const ctrl = new AbortController();
    abort.current = ctrl;
    const timer = setTimeout(() => {
      searchCommunes(q, ctrl.signal).then((items) => { setSugg(items); setHl(0); }).catch(() => {});
    }, 120);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [city]);

  async function run(place, label) {
    setSugg([]);
    setState({ status: 'loading', label });
    try {
      const res = await findPharmacies(place);
      setState({ status: 'done', label, ...res });
    } catch {
      setState({ status: 'error', label, place });
    }
  }

  function pick(item) {
    setCity(item.nom);
    inputRef.current?.blur();
    run({ lat: item.lat, lon: item.lon, insee: item.insee, ville: item.nom }, item.nom);
  }

  async function submit(e) {
    e.preventDefault();
    const q = city.trim();
    if (!q) return;
    if (sugg.length) return pick(sugg[hl] || sugg[0]);
    setState({ status: 'loading', label: q });
    try {
      const items = await searchCommunes(q);
      if (items.length) pick(items[0]); else setState({ status: 'done', label: q, list: [], mode: 'inconnue' });
    } catch { setState({ status: 'error', label: q }); }
  }

  async function aroundMe() {
    setSugg([]); setCity('');
    setState({ status: 'loading', label: 'vous' });
    try {
      const pos = await locate();
      run(pos, 'vous');
    } catch { setState({ status: 'geo' }); }
  }

  function onKey(e) {
    if (!sugg.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl((i) => (i + 1) % sugg.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHl((i) => (i - 1 + sugg.length) % sugg.length); }
    if (e.key === 'Escape') setSugg([]);
  }

  const s = state;
  const heading = s.status !== 'done' ? '' : s.mode === 'commune'
    ? `${s.total} pharmacie${s.total > 1 ? 's' : ''} à ${s.label}${s.total > s.list.length ? `, les ${s.list.length} plus proches du centre` : ''}`
    : s.partiel ? `Pharmacies françaises proches de ${s.label}`
      : s.label === 'vous' ? `Pharmacies autour de vous, dans un rayon de ${s.radius} km`
      : `Aucune pharmacie à ${s.label} même. Les plus proches, dans un rayon de ${s.radius} km`;

  return (
    <section>
      <h1 className="title">Pharmacies et garde</h1>
      <p className="lead">Les pharmacies d'une commune ou autour de vous, et le service de garde.</p>

      <form className="search" role="search" onSubmit={submit}>
        <Search size={19} />
        <input ref={inputRef} className="input" type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off"
          placeholder="Ville ou code postal" aria-label="Ville ou code postal" role="combobox" aria-expanded={sugg.length > 0} aria-controls="communes"
          value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={onKey} />
        {city && <button type="button" className="clear" aria-label="Effacer" onClick={() => { setCity(''); inputRef.current?.focus(); }}><Close size={18} /></button>}
      </form>
      {sugg.length > 0 && (
        <div className="suggest" id="communes" role="listbox">
          {sugg.map((it, i) => (
            <button key={it.insee + it.cp} type="button" role="option" aria-selected={i === hl} onClick={() => pick(it)}>
              <span>{it.nom}</span><span className="sub num">{it.cp}</span>
            </button>
          ))}
        </div>
      )}

      <button className="btn btn-outline btn-block mt-s mb" onClick={aroundMe}><Locate size={19} /> Autour de moi</button>

      {s.status === 'loading' && <div className="skeleton mb" style={{ height: 200 }} aria-busy="true" />}

      {s.status === 'geo' && (
        <div className="notice warn"><Alert size={17} /><p>Position indisponible. Autorisez la localisation pour ce site, ou saisissez votre ville.</p></div>
      )}
      {s.status === 'error' && (
        <Empty icon={<Alert size={26} />} title="Recherche impossible pour le moment">
          <p>Vérifiez votre connexion, puis réessayez. Le 3237 reste joignable par téléphone.</p>
          {s.place && <button className="btn btn-primary mt" onClick={() => run(s.place, s.label)}>Réessayer</button>}
        </Empty>
      )}

      {s.status === 'done' && (
        s.list.length === 0 ? (
          <Empty icon={<Pin size={26} />} title={s.mode === 'inconnue' ? 'Commune introuvable' : 'Aucune pharmacie à moins de 30 km'}>
            <p>{s.mode === 'inconnue' ? 'Vérifiez le nom ou essayez le code postal.' : 'Appelez le 3237 pour connaître la pharmacie ouverte la plus proche.'}</p>
          </Empty>
        ) : (
          <>
            <p className="count" role="status">{heading}</p>
            {s.partiel && <div className="notice warn"><Alert size={17} /><p>La liste des pharmacies de Monaco n'a pas pu être chargée. Voici les pharmacies françaises les plus proches.</p></div>}
            <div className="card flush appear">
              <div className="rows">
                {s.list.map((p, i) => (
                  <div className="row" key={i}>
                    <span className="pin"><Pin size={18} /></span>
                    <div className="body">
                      <div className="name">{p.name}</div>
                      <div className="sub">{[p.addr, s.mode !== 'commune' && p.ville].filter(Boolean).join(', ') || p.ville || s.label}</div>
                      <div className="dist num">{distance(p.dist)}{s.mode === 'commune' ? ' du centre' : ''}</div>
                    </div>
                    {tel(p.phone) && <a className="icon-btn" href={`tel:${tel(p.phone)}`} aria-label={`Appeler ${p.name}`}><Phone size={17} /></a>}
                    <a className="icon-btn" href={itineraire(p)} target="_blank" rel="noreferrer" aria-label={`Itinéraire vers ${p.name}`}><Route size={17} /></a>
                  </div>
                ))}
              </div>
            </div>
            <p className="small mb">Données OpenStreetMap. Les horaires et les gardes ne sont pas indiqués : appelez avant de vous déplacer.</p>
          </>
        )
      )}

      <aside className="card garde">
        <h2 className="h2">Pharmacie de garde</h2>
        <p className="small" style={{ margin: '4px 0 14px' }}>La nuit, le dimanche et les jours fériés, le 3237 indique la pharmacie de garde la plus proche, 24 h sur 24.</p>
        <a className="btn btn-block" href="tel:3237"><Phone size={18} /> Appeler le 3237</a>
        <p className="small" style={{ marginTop: 12 }}>
          Service payant, environ 0,35 € par minute. Aussi sur <a className="link" href="https://www.3237.fr" target="_blank" rel="noreferrer">3237.fr</a>. En Île-de-France, monpharmacien-idf.fr est gratuit. Après 22 h, certaines villes passent par le commissariat ou la gendarmerie.
        </p>
      </aside>
    </section>
  );
}

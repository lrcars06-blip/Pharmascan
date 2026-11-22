import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import MedSection from './components/MedSection.jsx';
import Welcome, { introDejaVue } from './components/Welcome.jsx';
import { Pill, Bottle, Pin, Box } from './lib/icons.jsx';
import { useRoute, useOnline } from './lib/route.js';
import { whenIdle } from './lib/http.js';
import { loadIndex } from './lib/bdpm.js';

// Seul l'écran d'accueil (médicaments) est dans le fichier principal ;
// les trois autres sont chargés à la demande puis préchargés au repos.
const loaders = {
  parapharmacie: () => import('./components/ParaSection.jsx'),
  pharmacies: () => import('./components/PharmaSection.jsx'),
  armoire: () => import('./components/ArmoireSection.jsx'),
};

const TABS = [
  { id: 'medicaments', label: 'Médicaments', Icon: Pill, Comp: MedSection },
  { id: 'parapharmacie', label: 'Parapharmacie', Icon: Bottle, Comp: lazy(loaders.parapharmacie) },
  { id: 'pharmacies', label: 'Pharmacies', Icon: Pin, Comp: lazy(loaders.pharmacies) },
  { id: 'armoire', label: 'Armoire', Icon: Box, Comp: lazy(loaders.armoire) },
];

const OFFLINE_FILES = ['/data/bdpm/index.json', '/data/bdpm/meta.json', '/data/pharmacies/meta.json'];

function Skeleton() {
  return (
    <div aria-hidden="true">
      <div className="skeleton" style={{ height: 30, width: '60%', margin: '8px 0 14px' }} />
      <div className="skeleton" style={{ height: 58, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 52 }} />
    </div>
  );
}

export default function App() {
  const [tabId, sub] = useRoute();
  const active = TABS.find((t) => t.id === tabId) || TABS[0];
  const online = useOnline();
  const [showIntro, setShowIntro] = useState(() => !introDejaVue());

  // Un onglet déjà ouvert reste monté (masqué) : y revenir est instantané
  // et la recherche en cours n'est pas perdue.
  const [opened, setOpened] = useState(() => new Set([active.id]));
  if (!opened.has(active.id)) setOpened(new Set(opened).add(active.id));

  // Chaque onglet retrouve sa propre position de défilement.
  const scrolls = useRef({});
  const current = useRef(active.id);
  useLayoutEffect(() => {
    if (current.current === active.id) return;
    current.current = active.id;
    window.scrollTo(0, scrolls.current[active.id] || 0);
  }, [active.id]);
  useEffect(() => {
    const save = () => { scrolls.current[current.current] = window.scrollY; };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  // Au repos : précharge la base médicaments et les autres onglets (sauf en mode économie de données).
  useEffect(() => {
    if (navigator.connection && navigator.connection.saveData) return undefined;
    whenIdle(() => {
      loadIndex().catch(() => {});
      Object.values(loaders).forEach((load) => load().catch(() => {}));
    });
    // Première visite : le service worker s'installe APRÈS ces téléchargements. Dès qu'il
    // contrôle la page, on lui repasse les fichiers essentiels pour qu'ils soient disponibles hors ligne.
    const sw = navigator.serviceWorker;
    if (!sw) return undefined;
    const keep = () => OFFLINE_FILES.forEach((url) => fetch(url).catch(() => {}));
    if (sw.controller) return undefined; // visites suivantes : déjà en cache
    sw.addEventListener('controllerchange', keep, { once: true });
    return () => sw.removeEventListener('controllerchange', keep);
  }, []);

  if (showIntro) return <Welcome onStart={() => setShowIntro(false)} />;

  return (
    <div className="app">
      <header className="topbar">
        <span className="mark"><Pill size={19} /></span>
        <span className="brand">Pharmascan</span>
        {!online && <span className="offline" role="status">Hors ligne</span>}
      </header>

      <main>
        {TABS.map(({ id, Comp }) => opened.has(id) && (
          <div key={id} hidden={id !== active.id}>
            <Suspense fallback={<Skeleton />}>
              <Comp sub={id === active.id ? sub : undefined} active={id === active.id} />
            </Suspense>
          </div>
        ))}
      </main>

      <nav className="tabbar" aria-label="Sections">
        <ul>
          {TABS.map(({ id, label, Icon }) => (
            <li key={id}>
              <a href={`#/${id}`} aria-current={id === active.id ? 'page' : undefined}>
                <Icon size={22} />{label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

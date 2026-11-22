import { Pill, Bottle, Pin, Box } from '../lib/icons.jsx';

const KEY = 'pharmascan_intro_vue';

const FEATURES = [
  { Icon: Pill, titre: 'Identifier un médicament', texte: 'Scannez la boîte ou tapez son nom : fiche officielle, prix, remboursement, génériques, notice.' },
  { Icon: Bottle, titre: 'Parapharmacie', texte: "Scannez un produit pour voir ses ingrédients, ou décrivez votre besoin à l'assistant." },
  { Icon: Pin, titre: 'Pharmacies et garde', texte: 'Les pharmacies de votre commune ou autour de vous, et le service de garde 3237.' },
  { Icon: Box, titre: 'Armoire à pharmacie', texte: 'Vos médicaments, leurs dates de péremption et vos prises du matin, du midi et du soir.' },
];

export function introDejaVue() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}

export default function Welcome({ onStart }) {
  function start() {
    try { localStorage.setItem(KEY, '1'); } catch { /* navigation privée */ }
    onStart();
  }

  return (
    <div className="welcome">
      <div className="inner">
        <span className="mark"><Pill size={32} /></span>
        <h1>Vos médicaments, en clair.</h1>
        <p className="lead" style={{ marginBottom: 22 }}>
          Pharmascan affiche l'information officielle sur vos médicaments et vous aide à trouver une pharmacie, partout en France.
        </p>

        <div style={{ marginBottom: 22 }}>
          {FEATURES.map(({ Icon, titre, texte }) => (
            <div className="feature" key={titre}>
              <span className="pin"><Icon size={19} /></span>
              <div>
                <h2 className="h3">{titre}</h2>
                <p className="meta">{texte}</p>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-primary btn-hero btn-block" onClick={start}>Commencer</button>

        <p className="small" style={{ marginTop: 14, textAlign: 'center' }}>
          Les informations proviennent de sources officielles et ouvertes. Elles ne remplacent jamais l'avis de votre pharmacien ou de votre médecin.
        </p>
      </div>
    </div>
  );
}

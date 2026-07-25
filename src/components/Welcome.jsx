import { useState } from 'react';
import { Pill } from '../lib/icons.jsx';

const KEY = 'pharmascan_intro_vue';

const FEATURES = [
  { icon: '💊', titre: 'Identifier un médicament', texte: 'Scannez la boîte ou tapez le nom : fiche officielle BDPM, prix, génériques, notice.' },
  { icon: '🧴', titre: 'Parapharmacie & Conseil IA', texte: 'Scannez un produit pour ses ingrédients, ou demandez conseil à l\'assistant intelligent.' },
  { icon: '📍', titre: 'Pharmacies partout en France', texte: 'Trouvez les pharmacies de n\'importe quelle ville ou village, et le service de garde 3237.' },
  { icon: '🗄️', titre: 'Votre armoire à pharmacie', texte: 'Suivez vos médicaments, dates de péremption et rappels de prise matin, midi et soir.' },
];

export function introDejaVue() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}

export default function Welcome({ onStart }) {
  const [closing, setClosing] = useState(false);

  function start() {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setClosing(true);
    setTimeout(onStart, 250);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'var(--bg)', overflowY: 'auto',
      display: 'flex', justifyContent: 'center',
      opacity: closing ? 0 : 1, transition: 'opacity 0.25s ease',
    }}>
      <div style={{ width: '100%', maxWidth: 480, padding: '48px 24px 32px', display: 'flex', flexDirection: 'column' }}>
        {/* Logo + titre */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{
            width: 64, height: 64, borderRadius: 18, background: 'var(--teal)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(15,110,86,0.3)',
          }}>
            <Pill size={34} stroke="#fff" />
          </span>
          <h1 style={{ margin: '18px 0 6px', fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>
            Bienvenue sur Pharmascan
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
            Votre compagnon santé au quotidien : identifiez vos médicaments,
            gérez votre armoire à pharmacie et trouvez une pharmacie partout en France.
          </p>
        </div>

        {/* Fonctionnalités */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {FEATURES.map((f) => (
            <div key={f.titre} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              background: '#fff', borderRadius: 14, padding: '14px 16px',
              border: '1px solid var(--line)',
            }}>
              <span style={{ fontSize: 26, lineHeight: 1 }}>{f.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{f.titre}</div>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>{f.texte}</p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={start} style={{
          padding: '15px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'var(--teal)', color: '#fff', fontSize: 16, fontWeight: 600,
          boxShadow: '0 6px 18px rgba(15,110,86,0.3)',
        }}>
          Commencer →
        </button>

        <p style={{ margin: '16px 0 0', fontSize: 11.5, color: 'var(--faint)', textAlign: 'center', lineHeight: 1.5 }}>
          Pharmascan fournit une information issue de sources officielles et ouvertes.
          Elle ne remplace jamais l'avis de votre pharmacien ou de votre médecin.
        </p>
      </div>
    </div>
  );
}

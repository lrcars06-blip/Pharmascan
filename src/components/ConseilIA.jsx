import { useState, useRef, useEffect } from 'react';
import { conseilIA } from '../lib/api.js';
import { addMed } from '../lib/storage.js';

// Besoins sélectionnables (plusieurs à la fois)
const BESOINS = [
  { icon: '😣', label: 'Boutons / acné', texte: "j'ai des boutons" },
  { icon: '😴', label: 'Mieux dormir', texte: 'je dors mal' },
  { icon: '🥱', label: 'Fatigue / vitamines', texte: 'je suis fatigué, quelles vitamines' },
  { icon: '🌵', label: 'Peau sèche', texte: "ma peau est très sèche" },
  { icon: '🤢', label: 'Digestion', texte: "j'ai des ballonnements" },
  { icon: '💇', label: 'Cheveux', texte: 'mes cheveux sont fragiles' },
  { icon: '😰', label: 'Stress', texte: 'je suis stressé' },
  { icon: '🛡️', label: 'Immunité', texte: 'je veux renforcer mon immunité' },
];

// Mappe le type de produit IA vers une catégorie de l'armoire
const TYPE_TO_CAT = { soin: 'soin', complement: 'complement', hygiene: 'soin', solaire: 'soin', 'premiers-soins': 'autre' };

export default function ConseilIA() {
  const [messages, setMessages] = useState([]); // {role, content, produits?, consulter?}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState(new Set());
  const [selection, setSelection] = useState(new Set()); // besoins cochés
  const endRef = useRef(null);

  function toggleBesoin(label) {
    setSelection((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function envoyerSelection() {
    const choisis = BESOINS.filter((b) => selection.has(b.label));
    if (!choisis.length) return;
    setSelection(new Set());
    send(choisis.map((b) => b.texte).join(', et ') + '.');
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    const nextMessages = [...messages, { role: 'user', content: msg }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      // Historique texte uniquement pour le contexte de conversation
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const data = await conseilIA(msg, history);
      setMessages([...nextMessages, {
        role: 'assistant',
        content: data.reponse,
        produits: data.produits || [],
        consulter: data.consulter_professionnel,
      }]);
    } catch (e) {
      console.error('Erreur conseil:', e);
      setMessages([...nextMessages, {
        role: 'assistant',
        content: "Le conseiller est momentanément indisponible. Réessayez dans un instant, ou demandez directement à votre pharmacien.",
        produits: [],
      }]);
    } finally {
      setLoading(false);
    }
  }

  function ajouterArmoire(produit, key) {
    addMed({
      name: produit.nom,
      category: TYPE_TO_CAT[produit.type] || 'autre',
      quantity: 1,
      notes: [produit.usage, produit.posologie?.description, produit.duree ? `Durée : ${produit.duree}` : '']
        .filter(Boolean).join(' — '),
      reminders: {
        matin: !!produit.posologie?.matin,
        midi: !!produit.posologie?.midi,
        soir: !!produit.posologie?.soir,
      },
    });
    setAddedIds((prev) => new Set(prev).add(key));
  }

  return (
    <div>
      <div style={{ background: 'var(--teal-soft)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--teal-ink)' }}>
          🤖 <b>Assistant conseil</b> — décrivez votre besoin (boutons, sommeil, vitamines…) et recevez des suggestions de produits de parapharmacie à ajouter à votre armoire.
        </p>
      </div>

      {/* Fil de conversation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {messages.length === 0 && (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)' }}>
              Sélectionnez un ou plusieurs besoins :
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {BESOINS.map((b) => {
                const on = selection.has(b.label);
                return (
                  <button key={b.label} onClick={() => toggleBesoin(b.label)}
                    style={{
                      padding: '8px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
                      border: on ? '1.5px solid var(--teal)' : '1px solid var(--line)',
                      background: on ? 'var(--teal-soft)' : '#fff',
                      color: on ? 'var(--teal-ink)' : 'var(--ink)',
                      fontWeight: on ? 600 : 400,
                    }}>
                    {on ? '✓ ' : ''}{b.icon} {b.label}
                  </button>
                );
              })}
            </div>
            {selection.size > 0 && (
              <button onClick={envoyerSelection}
                style={{
                  marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 10,
                  border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  background: 'var(--teal)', color: '#fff',
                }}>
                Obtenir mes conseils ({selection.size} besoin{selection.size > 1 ? 's' : ''})
              </button>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.5,
              ...(m.role === 'user'
                ? { marginLeft: 'auto', background: 'var(--teal)', color: '#fff', borderBottomRightRadius: 4 }
                : { marginRight: 'auto', background: '#fff', border: '1px solid var(--line)', borderBottomLeftRadius: 4 }),
            }}>
              {m.content}
            </div>

            {m.consulter && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: '#FDECEA', color: '#C0392B', fontSize: 13 }}>
                ⚕️ Ces symptômes méritent l'avis d'un médecin ou d'un pharmacien.
              </div>
            )}

            {/* Cartes produits recommandés */}
            {m.produits?.map((p, j) => {
              const key = `${i}-${j}`;
              const added = addedIds.has(key);
              const slots = [p.posologie?.matin && 'Matin', p.posologie?.midi && 'Midi', p.posologie?.soir && 'Soir'].filter(Boolean);
              return (
                <div key={key} style={{ marginTop: 8, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nom}</div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>{p.usage}</p>
                  {p.posologie?.description && (
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>💊 {p.posologie.description}{p.duree ? ` · ${p.duree}` : ''}</p>
                  )}
                  {slots.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      {slots.map((s) => (
                        <span key={s} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}>⏰ {s}</span>
                      ))}
                    </div>
                  )}
                  {p.precautions && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--faint)' }}>⚠️ {p.precautions}</p>}
                  <button
                    onClick={() => !added && ajouterArmoire(p, key)}
                    style={{
                      marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 9, border: 'none',
                      cursor: added ? 'default' : 'pointer', fontSize: 13, fontWeight: 600,
                      background: added ? 'var(--teal-soft)' : 'var(--teal)', color: added ? 'var(--teal-ink)' : '#fff',
                    }}
                  >
                    {added ? '✓ Ajouté à mon armoire (rappels activés)' : '➕ Ajouter à mon armoire'}
                  </button>
                </div>
              );
            })}
          </div>
        ))}

        {loading && (
          <div style={{ marginRight: 'auto', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, borderBottomLeftRadius: 4, padding: '10px 14px', fontSize: 14, color: 'var(--muted)' }}>
            Le conseiller réfléchit…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Zone de saisie */}
      <div className="field">
        <input
          value={input}
          placeholder="Décrivez votre besoin…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={() => send()} disabled={loading}>{loading ? '…' : 'Envoyer'}</button>
      </div>

      <p className="note" style={{ marginTop: 10 }}>
        ⚕️ Ces suggestions concernent uniquement la parapharmacie et ne remplacent jamais l'avis d'un pharmacien ou d'un médecin.
      </p>
    </div>
  );
}

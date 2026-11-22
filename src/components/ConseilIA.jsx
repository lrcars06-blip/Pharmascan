import { useState, useRef, useEffect } from 'react';
import { conseilIA } from '../lib/api.js';
import { addMed } from '../lib/storage.js';
import { Check, Plus, Alert } from '../lib/icons.jsx';

// Besoins sélectionnables (plusieurs à la fois)
const BESOINS = [
  { label: 'Boutons, acné', texte: "j'ai des boutons" },
  { label: 'Mieux dormir', texte: 'je dors mal' },
  { label: 'Fatigue, vitamines', texte: 'je suis fatigué, quelles vitamines' },
  { label: 'Peau sèche', texte: 'ma peau est très sèche' },
  { label: 'Digestion', texte: "j'ai des ballonnements" },
  { label: 'Cheveux', texte: 'mes cheveux sont fragiles' },
  { label: 'Stress', texte: 'je suis stressé' },
  { label: 'Immunité', texte: 'je veux renforcer mon immunité' },
];

// Type de produit proposé → catégorie de l'armoire
const TYPE_TO_CAT = { soin: 'soin', complement: 'complement', hygiene: 'soin', solaire: 'soin', 'premiers-soins': 'autre' };

export default function ConseilIA() {
  const [messages, setMessages] = useState([]); // { role, content, produits?, consulter? }
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(() => new Set());
  const [selection, setSelection] = useState(() => new Set());
  const endRef = useRef(null);

  const toggle = (label) => setSelection((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    const next = [...messages, { role: 'user', content: msg }];
    setMessages(next);
    setLoading(true);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const data = await conseilIA(msg, history);
      setMessages([...next, { role: 'assistant', content: data.reponse, produits: data.produits || [], consulter: data.consulter_professionnel }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: "L'assistant ne répond pas pour le moment. Réessayez dans un instant, ou demandez conseil à votre pharmacien.", produits: [] }]);
    } finally {
      setLoading(false);
    }
  }

  function sendSelection() {
    const choisis = BESOINS.filter((b) => selection.has(b.label));
    if (!choisis.length) return;
    setSelection(new Set());
    send(choisis.map((b) => b.texte).join(', et ') + '.');
  }

  function ajouter(produit, key) {
    addMed({
      name: produit.nom,
      category: TYPE_TO_CAT[produit.type] || 'autre',
      notes: [produit.usage, produit.posologie?.description, produit.duree ? `Durée : ${produit.duree}` : ''].filter(Boolean).join(' — '),
      reminders: { matin: !!produit.posologie?.matin, midi: !!produit.posologie?.midi, soir: !!produit.posologie?.soir },
    });
    setAdded((prev) => new Set(prev).add(key));
  }

  return (
    <div>
      {messages.length === 0 && (
        <div className="mb">
          <p className="label">Choisissez un ou plusieurs besoins, ou écrivez le vôtre</p>
          <div className="chips">
            {BESOINS.map((b) => (
              <button key={b.label} className="chip" aria-pressed={selection.has(b.label)} onClick={() => toggle(b.label)}>{b.label}</button>
            ))}
          </div>
          {selection.size > 0 && (
            <button className="btn btn-primary btn-block mt" onClick={sendSelection}>
              Voir les suggestions ({selection.size} besoin{selection.size > 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}

      <div className="thread" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className="stack" style={{ gap: 8 }}>
            <div className={'bubble ' + (m.role === 'user' ? 'user' : 'bot')}>{m.content}</div>

            {m.consulter && (
              <div className="notice danger" style={{ marginBottom: 0 }}>
                <Alert size={17} /><p>Ces symptômes méritent l'avis d'un médecin ou d'un pharmacien.</p>
              </div>
            )}

            {m.produits?.map((p, j) => {
              const key = `${i}-${j}`;
              const done = added.has(key);
              const slots = [p.posologie?.matin && 'Matin', p.posologie?.midi && 'Midi', p.posologie?.soir && 'Soir'].filter(Boolean);
              return (
                <div key={key} className="card" style={{ marginBottom: 0 }}>
                  <h3 className="h3">{p.nom}</h3>
                  <p className="meta" style={{ marginTop: 3 }}>{p.usage}</p>
                  {p.posologie?.description && <p style={{ marginTop: 6, fontSize: 14 }}>{p.posologie.description}{p.duree ? `, ${p.duree.toLowerCase()}` : ''}</p>}
                  {slots.length > 0 && <div className="tags mt-s">{slots.map((s) => <span key={s} className="tag ok">{s}</span>)}</div>}
                  {p.precautions && <p className="small mt-s">Précaution : {p.precautions}</p>}
                  {done
                    ? <button className="btn btn-soft btn-sm btn-block mt" disabled><Check size={16} /> Ajouté à mon armoire</button>
                    : <button className="btn btn-accent-outline btn-sm btn-block mt" onClick={() => ajouter(p, key)}><Plus size={16} /> Ajouter à mon armoire</button>}
                </div>
              );
            })}
          </div>
        ))}
        {loading && <div className="bubble bot meta">L'assistant prépare sa réponse…</div>}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" value={input} placeholder="Décrivez votre besoin" aria-label="Votre besoin" maxLength={2000}
          enterKeyHint="send" onChange={(e) => setInput(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={loading || !input.trim()}>Envoyer</button>
      </form>

      <p className="small mt">Suggestions de parapharmacie uniquement, générées automatiquement. Elles ne remplacent jamais l'avis d'un pharmacien ou d'un médecin.</p>
    </div>
  );
}

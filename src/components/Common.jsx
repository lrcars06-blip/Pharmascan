import { Alert } from '../lib/icons.jsx';

export function Disclaimer({ text }) {
  return (
    <div className="notice warn" style={{ marginBottom: 0 }}>
      <Alert size={17} />
      <p>{text || "Information à titre indicatif. Elle ne remplace pas l'avis d'un médecin ou d'un pharmacien."}</p>
    </div>
  );
}

// Sélecteur à deux ou trois positions (sous-onglets)
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} role="tab" type="button" aria-selected={value === id} onClick={() => onChange(id)}>{text}</button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }) {
  return (
    <div className="card empty appear">
      {icon && <div className="glyph">{icon}</div>}
      <h2 className="h2">{title}</h2>
      {children}
    </div>
  );
}

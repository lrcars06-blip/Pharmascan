// Navigation par l'ancre de l'URL (#/medicaments/60234100) :
// le bouton « retour » du téléphone fonctionne, et une fiche peut être partagée par lien.
import { useEffect, useState } from 'react';

const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

export function useRoute() {
  const [segments, setSegments] = useState(parse);
  useEffect(() => {
    const onChange = () => setSegments(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return segments;
}

let moved = false; // vrai dès qu'on a navigué à l'intérieur de l'application

export function navigate(path, { replace = false } = {}) {
  const hash = '#/' + path;
  if (hash === window.location.hash) return;
  if (!replace) moved = true;
  if (replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

// « Retour » : page précédente si elle appartient à l'application, sinon l'écran indiqué
// (cas d'une fiche ouverte directement depuis un lien partagé).
export function goBack(fallback) {
  if (moved) window.history.back(); else navigate(fallback, { replace: true });
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

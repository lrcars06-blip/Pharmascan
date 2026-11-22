import { useEffect, useRef, useState } from 'react';
import { Close, Flash, Swap } from '../lib/icons.jsx';

/* Scanner plein écran, pensé mobile d'abord.
   - Lit les codes-barres ET les DataMatrix (le petit carré des boîtes de médicaments).
   - Android / Chrome : lecteur natif du téléphone (BarcodeDetector), rien à télécharger.
   - iPhone / Safari / Firefox : décodeur zxing, téléchargé seulement à ce moment-là.
   - Lampe torche et changement de caméra quand l'appareil le permet.
   Props : onDetected(codeBrut), onClose(), title, hint */

const NATIVE_FORMATS = ['data_matrix', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    // Sans DataMatrix, le lecteur natif ne sait pas lire les boîtes de médicaments : on préfère zxing.
    if (!supported.includes('data_matrix') || !supported.includes('ean_13')) return null;
    return new window.BarcodeDetector({ formats: NATIVE_FORMATS.filter((f) => supported.includes(f)) });
  } catch { return null; }
}

async function zxingReader() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  const hints = new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.DATA_MATRIX, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
}

const message = (e) => {
  const name = e && e.name;
  if (name === 'NotAllowedError') return "L'accès à la caméra est refusé. Sur iPhone : Réglages, Safari, Caméra, Autoriser, puis rechargez la page. Sur Android : touchez le cadenas dans la barre d'adresse, puis Autorisations, Caméra.";
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Aucune caméra détectée sur cet appareil.';
  if (name === 'NotReadableError') return 'La caméra est utilisée par une autre application. Fermez-la, puis réessayez.';
  return "La caméra ne s'ouvre pas. Vérifiez l'autorisation caméra du navigateur, puis réessayez.";
};

const QUALITY = { width: { ideal: 1280 }, height: { ideal: 720 } };

export default function BarcodeScanner({ onDetected, onClose, title = 'Scanner un code', hint = 'Placez le code dans le cadre.' }) {
  const videoRef = useRef(null);
  const session = useRef(0);          // chaque ouverture de caméra a son numéro ; les anciennes s'arrêtent d'elles-mêmes
  const stops = useRef([]);
  const track = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [cams, setCams] = useState([]);
  const [cam, setCam] = useState(-1);
  const [torch, setTorch] = useState(null); // null = non disponible

  function stopAll() {
    session.current++;
    stops.current.forEach((stop) => { try { stop(); } catch { /* déjà arrêté */ } });
    stops.current = [];
    track.current = null;
  }

  async function open(deviceId) {
    stopAll();
    const id = session.current;
    const alive = () => session.current === id;
    setReady(false); setError(null); setTorch(null);

    const attempts = deviceId
      ? [{ deviceId: { exact: deviceId }, ...QUALITY }]
      : [{ facingMode: { exact: 'environment' }, ...QUALITY }, { facingMode: { ideal: 'environment' } }, true];

    let stream = null, lastErr = null;
    for (const video of attempts) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: false }); break; }
      catch (e) { lastErr = e; if (e && e.name === 'NotAllowedError') break; }
    }
    if (!stream) { if (alive()) setError(message(lastErr)); return; }
    const release = () => stream.getTracks().forEach((t) => t.stop());
    if (!alive()) return release();
    stops.current.push(release);

    const found = (raw) => {
      if (!alive() || !raw) return;
      stopAll();
      try { navigator.vibrate?.(60); } catch { /* non pris en charge */ }
      onDetected(raw);
    };

    try {
      const video = videoRef.current;
      const detector = await nativeDetector();
      if (detector) {
        video.srcObject = stream;
        await video.play();
        const loop = async () => {
          if (!alive()) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length) return found(codes[0].rawValue);
          } catch { /* image suivante */ }
          setTimeout(loop, 110); // ~9 lectures par seconde : fluide, sans vider la batterie
        };
        loop();
      } else {
        const reader = await zxingReader();
        if (!alive()) return;
        const controls = await reader.decodeFromStream(stream, video, (result) => { if (result) found(result.getText()); });
        stops.current.push(() => controls.stop());
      }
      if (!alive()) return;
      setReady(true);

      track.current = stream.getVideoTracks()[0] || null;
      const caps = track.current?.getCapabilities?.() || {};
      if (caps.torch) setTorch(false);

      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      if (!alive()) return;
      setCams(all);
      const current = track.current?.getSettings?.().deviceId;
      setCam(all.findIndex((d) => d.deviceId === (deviceId || current)));
    } catch (e) {
      if (alive()) { stopAll(); setError(message(e)); }
    }
  }

  async function toggleTorch() {
    const next = !torch;
    try { await track.current.applyConstraints({ advanced: [{ torch: next }] }); setTorch(next); } catch { setTorch(null); }
  }

  function switchCamera() {
    if (cams.length < 2) return;
    const next = (cam + 1 + cams.length) % cams.length;
    setCam(next);
    open(cams[next].deviceId);
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!navigator.mediaDevices?.getUserMedia) setError("Ce navigateur ne donne pas accès à la caméra. Ouvrez le site dans Safari (iPhone) ou Chrome (Android).");
    else open();
    return () => { stopAll(); document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, []);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label={title}>
      <video ref={videoRef} muted autoPlay playsInline />
      {!error && <div className="frame" />}

      <div className="bar">
        <span className="h3">{title}</span>
        <button className="round" onClick={onClose} aria-label="Fermer le scanner"><Close size={22} /></button>
      </div>

      {error ? (
        <div className="panel">
          <h2 className="h2">Caméra indisponible</h2>
          <p className="meta" style={{ margin: '8px 0 16px' }}>{error}</p>
          <div className="stack">
            <button className="btn btn-primary" onClick={() => open()}>Réessayer</button>
            <button className="btn btn-outline" onClick={onClose}>Fermer</button>
          </div>
        </div>
      ) : (
        <div className="foot">
          <p role="status">{ready ? hint : 'Ouverture de la caméra…'}{ready && torch === null ? ' Pas assez de lumière ? Rapprochez-vous d\'une lampe : ce navigateur ne donne pas accès au flash.' : ''}</p>
          <div className="tools">
            {torch !== null && <button className="round wide" aria-pressed={torch} onClick={toggleTorch}><Flash size={20} /> {torch ? 'Éteindre le flash' : 'Allumer le flash'}</button>}
            {cams.length > 1 && <button className="round" aria-label="Changer de caméra" onClick={switchCamera}><Swap size={21} /></button>}
          </div>
        </div>
      )}
    </div>
  );
}

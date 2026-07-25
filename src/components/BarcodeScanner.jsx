import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

/**
 * Ouvre la caméra et détecte un code-barres.
 * - Chrome/Edge/Android : BarcodeDetector natif (rapide)
 * - iPhone/Safari/Firefox : @zxing/browser en secours
 * La caméra arrière est demandée par contraintes (compatible iOS).
 * Props :
 *   onDetected(code: string) — appelé dès qu'un code est lu
 *   onClose()               — demande de fermeture
 */
export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stopFns = [];
    const CONSTRAINTS = { video: { facingMode: { ideal: 'environment' } }, audio: false };

    function fail(e) {
      if (cancelled) return;
      if (e && e.name === 'NotAllowedError') setError('Accès caméra refusé. Autorisez la caméra pour ce site dans les réglages de votre navigateur, puis réessayez.');
      else if (e && e.name === 'NotFoundError') setError('Aucune caméra détectée sur cet appareil.');
      else if (e && e.name === 'NotReadableError') setError('La caméra est utilisée par une autre application. Fermez-la puis réessayez.');
      else setError("Impossible d'ouvrir la caméra. Vérifiez que le site est bien en https et que la caméra est autorisée.");
    }

    // Détecteur natif (Chrome, Edge, Android). Retourne false si indisponible.
    async function startNative() {
      if (!('BarcodeDetector' in window)) return false;
      let detector;
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
          .filter((f) => supported.includes(f));
        if (!wanted.length) return false;
        detector = new window.BarcodeDetector({ formats: wanted });
      } catch { return false; }

      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return true; }
      stopFns.push(() => stream.getTracks().forEach((t) => t.stop()));
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setReady(true);

      const scan = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            stopFns.forEach((f) => f());
            onDetected(codes[0].rawValue);
            return;
          }
        } catch { /* frame suivante */ }
        requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
      return true;
    }

    // Secours universel : @zxing/browser avec contraintes (marche sur iPhone).
    async function startZxing() {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        CONSTRAINTS,
        videoRef.current,
        (result, err, ctrl) => {
          if (cancelled) { ctrl.stop(); return; }
          if (result) {
            ctrl.stop();
            onDetected(result.getText());
          }
        }
      );
      stopFns.push(() => controls.stop());
      if (!cancelled) setReady(true);
    }

    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Votre navigateur ne permet pas d'accéder à la caméra. Ouvrez le site dans Safari (iPhone) ou Chrome (Android).");
        return;
      }
      try {
        const ok = await startNative();
        if (!ok && !cancelled) await startZxing();
      } catch (e) {
        // le natif a échoué pour une raison caméra : on tente quand même zxing,
        // sauf si c'est un refus de permission (inutile de redemander)
        if (e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')) return fail(e);
        try { await startZxing(); } catch (e2) { fail(e2); }
      }
    })();

    return () => {
      cancelled = true;
      stopFns.forEach((f) => { try { f(); } catch { /* déjà arrêté */ } });
    };
  }, []);

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Scanner un code-barres</span>
          <button style={closeBtn} onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {error ? (
          <div style={errorBox}>
            <p style={{ margin: 0, fontSize: 14, color: '#E24B4A' }}>{error}</p>
            <button style={cancelBtn} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <div style={viewfinder}>
              <video ref={videoRef} style={video} muted autoPlay playsInline />
              {!ready && <div style={loadingOverlay}>Ouverture de la caméra…</div>}
              <div style={crosshair} />
            </div>
            <p style={hint}>Pointez le code-barres dans le cadre — la détection est automatique.</p>
            <button style={cancelBtn} onClick={onClose}>Annuler</button>
          </>
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 9999, padding: 16,
};
const modal = {
  background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420,
  overflow: 'hidden', display: 'flex', flexDirection: 'column',
};
const header = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '14px 16px', borderBottom: '1px solid #E8EBE8',
};
const closeBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 18, color: '#666', lineHeight: 1, padding: 4,
};
const viewfinder = {
  position: 'relative', background: '#000',
  aspectRatio: '4/3', overflow: 'hidden',
};
const video = {
  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
};
const loadingOverlay = {
  position: 'absolute', inset: 0, display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontSize: 14, background: 'rgba(0,0,0,0.5)',
};
const crosshair = {
  position: 'absolute',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '60%', height: '28%',
  border: '2px solid rgba(255,255,255,0.8)',
  borderRadius: 6,
  boxShadow: '0 0 0 2000px rgba(0,0,0,0.3)',
  pointerEvents: 'none',
};
const hint = {
  margin: 0, padding: '10px 16px', fontSize: 13,
  color: '#666', textAlign: 'center',
};
const cancelBtn = {
  margin: '0 16px 16px', padding: '10px 0', borderRadius: 10,
  background: '#F4F6F4', border: 'none', cursor: 'pointer',
  fontSize: 14, fontWeight: 500, color: '#333',
};
const errorBox = {
  padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
};

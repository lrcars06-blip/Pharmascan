import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

/* Scanner de codes-barres, pensé mobile d'abord.
   - Caméra arrière demandée en `exact` puis `ideal` puis n'importe laquelle
   - Bouton 🔄 pour basculer entre les caméras (si la mauvaise s'ouvre)
   - Android/Chrome : BarcodeDetector natif ; iPhone/Safari : @zxing renforcé
   Props : onDetected(code), onClose() */

const ZXING_HINTS = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
  ]],
  [DecodeHintType.TRY_HARDER, true],
]);

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const stopRef = useRef([]);       // fonctions d'arrêt de la session en cours
  const cancelledRef = useRef(false);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState([]); // caméras disponibles
  const [devIndex, setDevIndex] = useState(-1);

  const stopAll = useCallback(() => {
    stopRef.current.forEach((f) => { try { f(); } catch { /* déjà stoppé */ } });
    stopRef.current = [];
  }, []);

  const found = useCallback((code) => {
    if (cancelledRef.current) return;
    cancelledRef.current = true;
    stopAll();
    onDetected(code);
  }, [onDetected, stopAll]);

  function fail(e) {
    if (cancelledRef.current) return;
    if (e && e.name === 'NotAllowedError') setError("Accès caméra refusé. Sur iPhone : Réglages → Safari → Caméra → Autoriser, puis rechargez la page. Sur Android : icône 🔒 dans la barre d'adresse → Autorisations → Caméra.");
    else if (e && e.name === 'NotFoundError') setError('Aucune caméra détectée sur cet appareil.');
    else if (e && e.name === 'NotReadableError') setError('La caméra est utilisée par une autre application. Fermez-la puis réessayez.');
    else setError("Impossible d'ouvrir la caméra. Vérifiez l'autorisation caméra du navigateur puis réessayez.");
  }

  // Démarre le décodage sur un flux donné (natif si possible, sinon zxing)
  async function startDecoding(constraints) {
    // --- Détecteur natif (Android/Chrome) ---
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
          .filter((f) => supported.includes(f));
        if (wanted.length) {
          const detector = new window.BarcodeDetector({ formats: wanted });
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelledRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
          stopRef.current.push(() => stream.getTracks().forEach((t) => t.stop()));
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
          const scan = async () => {
            if (cancelledRef.current || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0) return found(codes[0].rawValue);
            } catch { /* frame suivante */ }
            requestAnimationFrame(scan);
          };
          requestAnimationFrame(scan);
          return;
        }
      } catch { /* bascule sur zxing */ }
    }
    // --- Secours universel : zxing (iPhone/Safari/Firefox) ---
    const reader = new BrowserMultiFormatReader(ZXING_HINTS);
    const controls = await reader.decodeFromConstraints(constraints, videoRef.current, (result, err, ctrl) => {
      if (cancelledRef.current) { ctrl.stop(); return; }
      if (result) found(result.getText());
    });
    stopRef.current.push(() => controls.stop());
    if (!cancelledRef.current) setReady(true);
  }

  // Ouvre la caméra : deviceId précis, sinon arrière exact, sinon arrière souple, sinon n'importe laquelle
  async function open(deviceId) {
    setReady(false);
    stopAll();
    const attempts = deviceId
      ? [{ video: { deviceId: { exact: deviceId } }, audio: false }]
      : [
          { video: { facingMode: { exact: 'environment' } }, audio: false },
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          { video: true, audio: false },
        ];
    let lastErr = null;
    for (const c of attempts) {
      try {
        await startDecoding(c);
        // permission accordée → on peut maintenant lister les caméras (labels visibles)
        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          const cams = all.filter((d) => d.kind === 'videoinput');
          setDevices(cams);
          if (deviceId) setDevIndex(cams.findIndex((d) => d.deviceId === deviceId));
        } catch { /* pas grave */ }
        return;
      } catch (e) {
        lastErr = e;
        if (e && e.name === 'NotAllowedError') break; // inutile d'insister
      }
    }
    fail(lastErr);
  }

  // Basculer vers la caméra suivante
  function switchCamera() {
    if (devices.length < 2) return;
    const next = (devIndex + 1 + devices.length) % devices.length;
    setDevIndex(next);
    setError(null);
    open(devices[next].deviceId);
  }

  useEffect(() => {
    cancelledRef.current = false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Votre navigateur ne permet pas d'accéder à la caméra. Ouvrez le site dans Safari (iPhone) ou Chrome (Android).");
      return;
    }
    open();
    return () => { cancelledRef.current = true; stopAll(); };
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
            <button style={retryBtn} onClick={() => { setError(null); open(); }}>🔄 Réessayer</button>
            <button style={cancelBtn} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <div style={viewfinder}>
              <video ref={videoRef} style={video} muted autoPlay playsInline />
              {!ready && <div style={loadingOverlay}>Ouverture de la caméra…</div>}
              <div style={crosshair} />
              {devices.length > 1 && (
                <button onClick={switchCamera} style={flipBtn} aria-label="Changer de caméra">🔄</button>
              )}
            </div>
            <p style={hint}>
              Pointez le code-barres dans le cadre — détection automatique.
              {devices.length > 1 ? ' Mauvaise caméra ? Touchez 🔄.' : ''}
            </p>
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
const flipBtn = {
  position: 'absolute', right: 10, bottom: 10,
  width: 44, height: 44, borderRadius: 22, border: 'none',
  background: 'rgba(255,255,255,0.85)', fontSize: 20, cursor: 'pointer',
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
const retryBtn = {
  margin: '0 16px', padding: '10px 0', borderRadius: 10,
  background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer',
  fontSize: 14, fontWeight: 600,
};
const errorBox = {
  padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
};

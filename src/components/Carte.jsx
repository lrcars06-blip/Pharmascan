import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { meta, dept, locate } from '../lib/pharmacies.js';
import { Locate } from '../lib/icons.jsx';

/* Carte de France des pharmacies.
   - Fond de carte : Plan IGN (Géoplateforme, service public, sans clé).
   - Aucune donnée supplémentaire : vue nationale = un compteur par département
     (meta.json) ; en zoomant, seuls les départements visibles sont chargés.
   - Les points proches sont regroupés ; le détail apparaît au zoom. */

const TILES = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const FRANCE = [[41.2, -5.3], [51.2, 9.7]];
const DETAIL = 9;   // à partir de ce zoom, on affiche les officines elles-mêmes
const SOLO = 14;    // à partir de ce zoom, plus aucun regroupement
const CELL = 64;    // taille d'un groupe, en pixels

const bubble = (n, kind = '') => L.divIcon({ className: '', html: `<span class="map-bubble ${kind}">${n > 999 ? Math.round(n / 100) / 10 + ' k' : n}</span>`, iconSize: [0, 0] });

// Contenu d'une bulle d'information, construit sans innerHTML (les noms viennent d'OpenStreetMap).
function popup(p) {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const root = el('div', 'map-popup');
  root.append(el('strong', '', p.name));
  if (p.type === 'para') root.append(el('span', 'tag info', 'Parapharmacie'));
  const addr = [p.addr, p.ville].filter(Boolean).join(', ');
  if (addr) root.append(el('span', 'sub', addr));
  const actions = el('div', 'actions');
  const phone = (p.phone || '').split(/[;,/]/)[0].replace(/[^\d+]/g, '');
  if (phone) { const a = el('a', 'btn btn-outline btn-sm', 'Appeler'); a.href = `tel:${phone}`; actions.append(a); }
  const go = el('a', 'btn btn-primary btn-sm', 'Itinéraire');
  go.href = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`; go.target = '_blank'; go.rel = 'noreferrer';
  actions.append(go);
  root.append(actions);
  return root;
}

export default function Carte({ focus, visible }) {
  const box = useRef(null);
  const map = useRef(null);
  const [info, setInfo] = useState('Chargement de la carte…');

  useEffect(() => {
    const m = L.map(box.current, { preferCanvas: true, minZoom: 5, maxZoom: 18, zoomControl: true, attributionControl: true });
    map.current = m;
    m.attributionControl.setPrefix(false);
    L.tileLayer(TILES, { maxZoom: 18, attribution: 'Fond de carte © IGN · Pharmacies © contributeurs OpenStreetMap' }).addTo(m);
    if (focus) m.setView([focus.lat, focus.lon], 13); else m.fitBounds(FRANCE);

    const layer = L.layerGroup().addTo(m);
    let run = 0;

    async function draw() {
      const id = ++run;
      let data;
      try { data = await meta(); } catch { setInfo('Carte indisponible hors ligne.'); return; }
      if (id !== run) return;
      const zoom = m.getZoom(), view = m.getBounds();
      const marks = [];

      if (zoom < DETAIL) {
        // Vue d'ensemble : les départements voisins sont additionnés pour rester lisibles sur un téléphone.
        const cells = new Map();
        for (const [code, [a, b, c, d, n, lat, lon]] of Object.entries(data.depts)) {
          const pos = [lat ?? (a + c) / 2, lon ?? (b + d) / 2];
          const px = m.project(pos, zoom);
          const key = `${Math.floor(px.x / CELL)}:${Math.floor(px.y / CELL)}`;
          const cell = cells.get(key) || { n: 0, lat: 0, lon: 0, codes: [], box: [90, 180, -90, -180] };
          cell.n += n; cell.lat += pos[0] * n; cell.lon += pos[1] * n; cell.codes.push(code);
          cell.box = [Math.min(cell.box[0], a), Math.min(cell.box[1], b), Math.max(cell.box[2], c), Math.max(cell.box[3], d)];
          cells.set(key, cell);
        }
        for (const cell of cells.values()) {
          const mk = L.marker([cell.lat / cell.n, cell.lon / cell.n], { icon: bubble(cell.n, 'dept'), keyboard: false });
          mk.on('click', () => m.fitBounds([[cell.box[0], cell.box[1]], [cell.box[2], cell.box[3]]], { maxZoom: 12 }));
          if (cell.codes.length === 1) mk.bindTooltip(`Département ${cell.codes[0]}`);
          marks.push(mk);
        }
        setInfo(`${data.total.toLocaleString('fr-FR')} pharmacies. Touchez un nombre ou zoomez.`);
      } else {
        const codes = Object.entries(data.depts)
          .filter(([, [a, b, c, d]]) => c >= view.getSouth() && a <= view.getNorth() && d >= view.getWest() && b <= view.getEast())
          .map(([code]) => code);
        let lists;
        try { lists = await Promise.all(codes.map(dept)); } catch { setInfo('Données indisponibles hors ligne pour cette zone.'); return; }
        if (id !== run) return;
        const pad = view.pad(0.15);
        const points = lists.flat().filter((p) => pad.contains([p.lat, p.lon]));

        const cells = new Map();
        for (const p of points) {
          const px = m.project([p.lat, p.lon], zoom);
          const key = zoom >= SOLO ? `${p.lat},${p.lon}` : `${Math.floor(px.x / CELL)}:${Math.floor(px.y / CELL)}`;
          const cell = cells.get(key);
          if (cell) { cell.n++; cell.lat += p.lat; cell.lon += p.lon; } else cells.set(key, { n: 1, lat: p.lat, lon: p.lon, p });
        }
        for (const cell of cells.values()) {
          if (cell.n === 1) {
            const para = cell.p.type === 'para';
            const mk = L.circleMarker([cell.p.lat, cell.p.lon], { radius: 8, weight: 2, color: '#fff', fillColor: para ? '#0C447C' : '#0F6E56', fillOpacity: 1 });
            mk.bindPopup(() => popup(cell.p), { maxWidth: 260 });
            marks.push(mk);
          } else {
            const pos = [cell.lat / cell.n, cell.lon / cell.n];
            const mk = L.marker(pos, { icon: bubble(cell.n), keyboard: false });
            mk.on('click', () => m.setView(pos, Math.min(zoom + 2, 18)));
            marks.push(mk);
          }
        }
        const shown = points.filter((p) => view.contains([p.lat, p.lon])).length;
        setInfo(shown ? `${shown.toLocaleString('fr-FR')} pharmacie${shown > 1 ? 's' : ''} dans cette zone. Touchez un point pour l'adresse et l'itinéraire.` : 'Aucune pharmacie dans cette zone.');
      }
      layer.clearLayers();
      marks.forEach((mk) => mk.addTo(layer));
    }

    m.on('moveend', draw);
    draw();
    return () => { run = -1; m.remove(); map.current = null; };
  }, []);

  // La carte est créée une fois puis gardée : à chaque retour, on recalcule sa taille.
  useEffect(() => { if (visible) map.current?.invalidateSize(); }, [visible]);
  useEffect(() => { if (focus && map.current) map.current.setView([focus.lat, focus.lon], 13); }, [focus?.lat, focus?.lon]);

  async function aroundMe() {
    try {
      const pos = await locate();
      map.current.setView([pos.lat, pos.lon], 14);
      L.circleMarker([pos.lat, pos.lon], { radius: 7, weight: 3, color: '#fff', fillColor: '#1A73E8', fillOpacity: 1, interactive: false }).addTo(map.current);
    } catch { setInfo('Position indisponible. Autorisez la localisation pour ce site.'); }
  }

  return (
    <div>
      <div className="map-wrap">
        <div ref={box} className="map" role="application" aria-label="Carte des pharmacies de France" />
        <button className="btn btn-outline btn-sm map-locate" onClick={aroundMe}><Locate size={17} /> Autour de moi</button>
      </div>
      <p className="small mt-s" role="status">{info}</p>
    </div>
  );
}

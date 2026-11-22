import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/* En production (Vercel), /api/* = fonctions serverless du dossier /api.
   En développement, ce petit plugin exécute LES MÊMES fichiers : un seul
   code à maintenir, et `npm run dev` suffit (plus de serveur Express). */
function devApi() {
  const safe = /^[A-Za-z0-9-]+$/;
  const resolve = (parts) => {
    if (!parts.length || parts.length > 2 || !parts.every((p) => safe.test(p))) return null;
    if (parts.length === 1) return existsSync(`api/${parts[0]}.js`) ? { file: `api/${parts[0]}.js`, params: {} } : null;
    const dir = join('api', parts[0]);
    if (!existsSync(dir)) return null;
    const dyn = readdirSync(dir).find((f) => /^\[\w+\]\.js$/.test(f));
    return dyn ? { file: `${dir}/${dyn}`, params: { [dyn.slice(1, -4)]: parts[1] } } : null;
  };
  return {
    name: 'pharmascan-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const route = resolve(url.pathname.slice(5).split('/').filter(Boolean));
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
        if (!route) return res.status(404).json({ error: 'route inconnue' });
        try {
          req.query = { ...Object.fromEntries(url.searchParams), ...route.params };
          if (req.method === 'POST') {
            let raw = '';
            for await (const chunk of req) raw += chunk;
            try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
          }
          const mod = await server.ssrLoadModule('/' + route.file);
          await mod.default(req, res);
        } catch (e) {
          console.error('[api]', e);
          if (!res.writableEnded) res.status(500).json({ error: 'erreur serveur' });
        }
      });
    },
  };
}

const DAY = 86400;

export default defineConfig(({ mode }) => {
  // .env → process.env pour les fonctions /api en développement (ANTHROPIC_API_KEY, CONSEIL_MODEL)
  const env = loadEnv(mode, process.cwd(), '');
  for (const k of ['ANTHROPIC_API_KEY', 'CONSEIL_MODEL']) if (env[k] && !process.env[k]) process.env[k] = env[k];

  return {
    plugins: [
      react(),
      devApi(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        workbox: {
          // La nouvelle version prend le contrôle immédiatement
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Pré-cache : uniquement l'application (≈ 70 Ko compressés).
          // Les données et le décodeur de secours (iPhone) sont mis en cache à la demande.
          globIgnores: ['**/data/**', '**/zxing-*.js'],
          navigateFallbackDenylist: [/^\/api\//, /^\/data\//],
          runtimeCaching: [
            { // Bases embarquées (médicaments, pharmacies) : réponse immédiate depuis le cache, mise à jour en arrière-plan
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/data/'),
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'donnees', expiration: { maxEntries: 500, maxAgeSeconds: 60 * DAY }, cacheableResponse: { statuses: [200] } },
            },
            { // Fichiers versionnés chargés à la demande (décodeur de codes-barres)
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
              handler: 'CacheFirst',
              options: { cacheName: 'application', expiration: { maxEntries: 40, maxAgeSeconds: 365 * DAY }, cacheableResponse: { statuses: [200] } },
            },
            { // Produits de parapharmacie déjà consultés
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/parapharmacie/'),
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'produits', expiration: { maxEntries: 150, maxAgeSeconds: 7 * DAY }, cacheableResponse: { statuses: [200] } },
            },
            { // Communes déjà cherchées
              urlPattern: ({ url }) => url.origin === 'https://data.geopf.fr',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'communes', expiration: { maxEntries: 200, maxAgeSeconds: 30 * DAY }, cacheableResponse: { statuses: [200] } },
            },
          ],
        },
        manifest: {
          name: 'Pharmascan',
          short_name: 'Pharmascan',
          description: 'Identifier un médicament, un produit de parapharmacie, trouver une pharmacie de garde.',
          lang: 'fr',
          start_url: '/',
          theme_color: '#0F6E56',
          background_color: '#F4F6F4',
          display: 'standalone',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
          shortcuts: [
            { name: 'Pharmacies et garde', url: '/#/pharmacies' },
            { name: 'Mon armoire', url: '/#/armoire' },
          ],
        },
      }),
    ],
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          // Le décodeur zxing (≈ 115 Ko compressés) reste dans son propre fichier,
          // téléchargé seulement sur les appareils sans lecteur natif (iPhone).
          manualChunks: (id) => (id.includes('@zxing') ? 'zxing' : undefined),
        },
      },
    },
  };
});

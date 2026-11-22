# Pharmascan

Application qui permet d'**identifier un médicament** (base officielle BDPM/ANSM) ou un **produit de parapharmacie** (Open Beauty Facts), de **trouver une pharmacie** et le **contact de garde** (3237), et de gérer une **armoire à pharmacie** avec rappels.

> **Principe de sécurité :** l'application affiche des données **officielles et factuelles**. Elle n'invente jamais d'information médicale. Pour la posologie détaillée, elle renvoie vers la notice officielle.

---

## Démarrer en local

Pré-requis : **Node.js 18+**.

```bash
npm install
npm run dev
```

Ouvrez `http://localhost:5173`. Une seule commande : en développement, Vite exécute lui-même les fonctions du dossier `/api` (les mêmes fichiers que sur Vercel).

Pour le conseil par IA en local, créez un fichier `.env` avec `ANTHROPIC_API_KEY=...` (sans clé, un moteur de règles répond à la place).

---

## Architecture

Principe : **tout ce qui peut être embarqué l'est**. Le site ne dépend d'un service extérieur que lorsqu'il n'y a pas d'alternative.

```
Navigateur (React + Vite + PWA)
   │
   ├─ /data/bdpm/…        base médicaments LOCALE (fichiers officiels BDPM)
   │                      → recherche instantanée, fiches, codes CIP, génériques,
   │                        ruptures et tensions ANSM. Fonctionne hors ligne.
   ├─ /data/pharmacies/…  ~19 700 officines par département (OpenStreetMap)
   │                      → par commune ou « autour de moi », sans service externe.
   ├─ data.geopf.fr       autocomplétion des communes (Géoplateforme IGN, appel direct)
   └─ /api/…              fonctions Vercel, mises en cache par le CDN
        ├─ parapharmacie/[code]  Open Beauty / Food / Products Facts + Open Prices, en parallèle
        ├─ conseil               assistant parapharmacie (Claude, ou règles sans clé)
        ├─ pharmacies            secours OpenStreetMap (Monaco, base locale inaccessible)
        └─ communes              secours si l'appel direct à la Géoplateforme échoue
```

### Fichiers clés
- `scripts/build-bdpm.mjs` — télécharge les fichiers officiels BDPM et génère `public/data/bdpm/`
- `scripts/build-pharmacies.mjs` — génère `public/data/pharmacies/`
- `src/lib/bdpm.js` — recherche et fiches médicaments (dans le navigateur)
- `src/lib/codes.js` — lecture des codes scannés (DataMatrix GS1, CIP 13, CIP 7, EAN)
- `src/lib/pharmacies.js` — pharmacies par commune ou par rayon, communes
- `src/lib/storage.js` — armoire, fiche d'urgence, historique (stockage local de l'appareil)
- `src/components/*` — les 4 sections (Médicaments, Parapharmacie, Pharmacies, Armoire)
- `src/index.css` — la direction artistique (variables de couleur, mode sombre, composants)
- `api/*` — les fonctions serverless ; `vite.config.js` les exécute aussi en local

### Mettre à jour les données

| Commande | Effet | Quand |
|---|---|---|
| `npm run build:bdpm` | Retélécharge la BDPM officielle et régénère la base médicaments | Automatique à chaque déploiement Vercel ; à la main pour rafraîchir la copie du dépôt |
| `npm run build:pharmacies` | Retélécharge les pharmacies (France + Monaco) depuis OpenStreetMap | Tous les quelques mois (2 à 5 minutes) |

À chaque déploiement, Vercel rafraîchit la base médicaments. Si le site officiel ne répond pas, la copie enregistrée dans le dépôt est utilisée : le déploiement n'échoue jamais pour cette raison.

Le script BDPM contrôle le format des fichiers officiels avant d'écrire quoi que ce soit : si le format change, il s'arrête au lieu de publier des données fausses.

---

## Feuille de route

- [ ] **Notice officielle structurée** (posologie, contre-indications, effets indésirables) — la fiche renvoie aujourd'hui à la notice officielle.
- [ ] **Rappels par notification** — les prises cochées dans l'armoire sont un pense-bête, sans notification.
- [ ] **Comptes utilisateurs** — pour synchroniser l'armoire entre appareils.
- [ ] **OCR d'ordonnance** — modèle de vision côté serveur (donnée de santé sensible).
- [ ] **Limite d'appels sur `/api/conseil`** — la route est publique et chaque appel coûte ; à protéger avant d'ouvrir largement.

---

## Sources & licences

- **BDPM** (médicaments, prix, génériques, disponibilité) — fichiers publics téléchargés sur base-donnees-publique.medicaments.gouv.fr, source ANSM / HAS / UNCAM.
- **Open Beauty Facts** & **Open Prices** — licence **ODbL** (réutilisation commerciale avec attribution et partage à l'identique).
- **Base Adresse Nationale** (via la Géoplateforme IGN) & **OpenStreetMap** — données ouvertes (attribution requise pour OSM).

## Conformité

Données traitées : médicaments, produits, pharmacies — **pas de données patients**. Avant tout déploiement : CGU, RGPD (hébergement UE), et revue juridique. L'application est un outil d'**information**, pas de conseil médical.

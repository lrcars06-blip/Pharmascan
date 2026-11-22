/* ============================================================
   Pharmascan — Conseil IA parapharmacie
   Logique partagée entre la fonction Vercel (api/conseil.js)
   et le serveur de développement (vite.config.js).

   Avec ANTHROPIC_API_KEY  → Claude (modèle : CONSEIL_MODEL) répond avec
   des recommandations structurées (JSON schema garanti).
   Sans clé                → moteur de règles local (mots-clés).
   ============================================================ */
import Anthropic from '@anthropic-ai/sdk';

// Modèle modifiable sans toucher au code : variable d'environnement CONSEIL_MODEL sur Vercel.
const MODEL = process.env.CONSEIL_MODEL || 'claude-opus-5';

const SYSTEM = `Tu es le conseiller parapharmacie de l'application Pharmascan.
Ton rôle : recommander des produits de PARAPHARMACIE uniquement — cosmétiques, soins de la peau et des cheveux, compléments alimentaires, hygiène, solaires, premiers soins en vente libre.

Règles strictes :
- Ne recommande JAMAIS de médicament (avec ou sans ordonnance), ne pose JAMAIS de diagnostic, ne dis JAMAIS qu'un produit soigne, guérit ou prévient une maladie.
- Compléments alimentaires : n'emploie que des bénéfices correspondant aux allégations de santé autorisées dans l'Union européenne (ex. « le magnésium contribue à réduire la fatigue »). Cosmétiques : décris un effet sur la peau ou les cheveux, jamais un effet thérapeutique.
- Recommande des TYPES de produits avec leurs actifs (ex. « gel nettoyant à l'acide salicylique »), pas des marques précises sauf si l'utilisateur en parle.
- Mode d'emploi : indique seulement le moment habituel de la prise ou de l'application et renvoie à l'étiquette du produit pour la quantité. Ne calcule jamais une dose pour une personne.
- L'utilisateur peut exprimer PLUSIEURS besoins à la fois : traite chaque besoin et propose 1 à 2 produits par besoin, maximum 5 produits au total. Reste concis.
- Femme enceinte ou allaitante, enfant de moins de 12 ans, maladie chronique ou traitement médicamenteux en cours : ne propose aucun complément alimentaire, mets consulter_professionnel à true et oriente vers le pharmacien.
- Symptômes sérieux, persistants ou inhabituels (fièvre élevée, douleur intense, symptôme qui dure…) : mets consulter_professionnel à true, dis-le clairement, ne propose aucun produit.
- Coche matin/midi/soir pour que l'utilisateur puisse programmer ses rappels dans son armoire.
- Réponds toujours en français, sur un ton chaleureux et professionnel de pharmacien de comptoir.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reponse', 'produits', 'consulter_professionnel'],
  properties: {
    reponse: { type: 'string', description: "Réponse conversationnelle courte à l'utilisateur (2-4 phrases)" },
    consulter_professionnel: { type: 'boolean', description: 'true si un avis médecin/pharmacien est nécessaire' },
    produits: {
      type: 'array',
      description: 'Produits de parapharmacie recommandés (0 à 3)',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nom', 'type', 'usage', 'posologie', 'duree', 'precautions'],
        properties: {
          nom: { type: 'string', description: 'Nom générique du produit, ex. "Gel nettoyant purifiant"' },
          type: { type: 'string', description: 'Catégorie : soin, complement, hygiene, solaire, premiers-soins' },
          usage: { type: 'string', description: "Comment l'utiliser, en une phrase" },
          posologie: {
            type: 'object',
            additionalProperties: false,
            required: ['matin', 'midi', 'soir', 'description'],
            properties: {
              matin: { type: 'boolean' },
              midi: { type: 'boolean' },
              soir: { type: 'boolean' },
              description: { type: 'string', description: 'Moment habituel, sans quantité personnalisée. Ex. "Le soir, selon l\'étiquette du produit"' },
            },
          },
          duree: { type: 'string', description: 'Durée conseillée, ex. "1 mois", "jusqu\'à amélioration"' },
          precautions: { type: 'string', description: 'Précautions ou contre-indications principales' },
        },
      },
    },
  },
};

// --- Moteur de règles local (fallback sans clé API) ---
const REGLES = [
  {
    mots: ['bouton', 'acne', 'acné', 'imperfection', 'point noir', 'comédon'],
    reponse: "Pour les imperfections, une routine simple en deux temps donne de bons résultats : nettoyer en douceur puis cibler les boutons. Si l'acné est étendue ou douloureuse, parlez-en à un dermatologue.",
    produits: [
      { nom: 'Gel nettoyant purifiant (acide salicylique)', type: 'soin', usage: 'Nettoyer le visage matin et soir avec une noisette de gel.', posologie: { matin: true, midi: false, soir: true, description: 'Matin et soir sur peau humide' }, duree: 'En continu', precautions: 'Éviter le contour des yeux.' },
      { nom: 'Soin anti-imperfections (niacinamide)', type: 'soin', usage: 'Appliquer localement sur les zones à imperfections après le nettoyage.', posologie: { matin: false, midi: false, soir: true, description: 'Le soir après nettoyage' }, duree: '4 à 8 semaines', precautions: 'Introduire progressivement si peau sensible.' },
    ],
  },
  {
    mots: ['seche', 'sèche', 'sécheresse', 'secheresse', 'tiraille', 'dartre', 'hydrat'],
    reponse: "Pour une peau sèche qui tiraille, l'essentiel est de restaurer la barrière cutanée avec des soins riches en lipides et de nettoyer sans agresser.",
    produits: [
      { nom: 'Crème hydratante aux céramides', type: 'soin', usage: 'Appliquer sur le visage et les zones sèches.', posologie: { matin: true, midi: false, soir: true, description: 'Matin et soir sur peau propre' }, duree: 'En continu', precautions: 'Choisir une formule sans parfum si peau réactive.' },
      { nom: 'Huile lavante surgras', type: 'hygiene', usage: 'Remplacer le gel douche classique sous la douche.', posologie: { matin: false, midi: false, soir: true, description: 'À chaque douche' }, duree: 'En continu', precautions: 'Rincer abondamment.' },
    ],
  },
  {
    mots: ['sommeil', 'dormir', 'dors', 'insomnie', 'endormissement', 'reveille la nuit', 'melatonine'],
    reponse: "Pour retrouver un meilleur sommeil, la mélatonine aide à l'endormissement et certaines plantes favorisent la détente. Si les troubles durent plus de quelques semaines, consultez votre médecin.",
    produits: [
      { nom: 'Mélatonine', type: 'complement', usage: "Prendre 30 minutes avant le coucher pour faciliter l'endormissement.", posologie: { matin: false, midi: false, soir: true, description: '30 min avant le coucher, selon l\'étiquette' }, duree: '2 à 4 semaines', precautions: 'Déconseillé aux femmes enceintes ; éviter la conduite après la prise.' },
      { nom: 'Complexe valériane-passiflore', type: 'complement', usage: 'En infusion ou gélule le soir pour favoriser la détente.', posologie: { matin: false, midi: false, soir: true, description: 'Le soir, selon l\'étiquette' }, duree: '2 à 4 semaines', precautions: 'Interactions possibles avec les sédatifs.' },
    ],
  },
  {
    mots: ['fatigue', 'fatigué', 'épuisé', 'vitamine', 'tonus', 'énergie', 'energie'],
    reponse: "En cas de coup de fatigue passager, le magnésium et la vitamine C peuvent aider. Une fatigue qui persiste plusieurs semaines mérite un avis médical et un bilan.",
    produits: [
      { nom: 'Magnésium + vitamine B6', type: 'complement', usage: 'Cure pour réduire la fatigue et soutenir le système nerveux.', posologie: { matin: true, midi: false, soir: true, description: 'Matin et soir pendant les repas, selon l\'étiquette' }, duree: '1 mois', precautions: 'Peut avoir un effet laxatif à forte dose.' },
      { nom: 'Vitamine C', type: 'complement', usage: 'Le matin pour soutenir le tonus et les défenses.', posologie: { matin: true, midi: false, soir: false, description: 'Le matin, selon l\'étiquette' }, duree: '1 mois', precautions: 'Éviter la prise le soir (peut retarder le sommeil).' },
    ],
  },
  {
    mots: ['digestion', 'ballonnement', 'transit', 'constipation', 'ventre'],
    reponse: "Pour un confort digestif au quotidien, les probiotiques rééquilibrent la flore intestinale. Si les troubles sont douloureux ou durables, parlez-en à votre pharmacien ou médecin.",
    produits: [
      { nom: 'Probiotiques (ferments lactiques)', type: 'complement', usage: 'Cure pour rééquilibrer la flore intestinale.', posologie: { matin: true, midi: false, soir: false, description: 'Le matin à jeun, selon l\'étiquette' }, duree: '1 mois renouvelable', precautions: 'Conserver au frais selon la formule.' },
      { nom: 'Charbon végétal activé', type: 'complement', usage: 'En cas de ballonnements ponctuels après le repas.', posologie: { matin: false, midi: true, soir: true, description: 'Après les repas si besoin' }, duree: 'Ponctuel', precautions: 'À distance (2h) de tout médicament — il en réduit l\'absorption.' },
    ],
  },
  {
    mots: ['soleil', 'solaire', 'coup de soleil', 'uv', 'bronzage'],
    reponse: "Protection d'abord, réparation ensuite : un SPF 50 en prévention, et un après-soleil apaisant en cas de rougeur. Un coup de soleil avec cloques nécessite un avis médical.",
    produits: [
      { nom: 'Crème solaire SPF 50+', type: 'solaire', usage: "Appliquer généreusement 20 min avant l'exposition, renouveler toutes les 2h.", posologie: { matin: true, midi: true, soir: false, description: 'Avant et pendant l\'exposition' }, duree: 'Pendant les périodes d\'exposition', precautions: 'Renouveler après chaque baignade.' },
      { nom: 'Après-soleil réparateur', type: 'soin', usage: "Appliquer en couche généreuse sur les zones exposées après la douche.", posologie: { matin: false, midi: false, soir: true, description: 'Le soir après exposition' }, duree: 'Ponctuel', precautions: 'Consulter si cloques ou fièvre.' },
    ],
  },
  {
    mots: ['cheveux', 'chute', 'pellicule', 'cuir chevelu'],
    reponse: "Pour les cheveux, on agit de l'intérieur (compléments) et de l'extérieur (soins adaptés). Une chute brutale ou par plaques justifie une consultation dermatologique.",
    produits: [
      { nom: 'Complément biotine + zinc + kératine', type: 'complement', usage: 'Cure de fond pour la vitalité des cheveux et des ongles.', posologie: { matin: true, midi: false, soir: false, description: 'Le matin, selon l\'étiquette' }, duree: '3 mois', precautions: 'Résultats visibles après 2-3 mois minimum.' },
      { nom: 'Shampooing doux fortifiant', type: 'hygiene', usage: '2 à 3 lavages par semaine en massant le cuir chevelu.', posologie: { matin: false, midi: false, soir: false, description: '2-3 fois par semaine' }, duree: 'En continu', precautions: 'Éviter l\'eau trop chaude.' },
    ],
  },
  {
    mots: ['stress', 'anxiete', 'anxiété', 'nervosité', 'nerveux'],
    reponse: "Pour le stress passager, le magnésium et certaines plantes adaptogènes peuvent aider à retrouver le calme. Un mal-être durable mérite d'en parler à un professionnel de santé.",
    produits: [
      { nom: 'Magnésium marin + B6', type: 'complement', usage: 'Cure de fond pour réduire nervosité et fatigue.', posologie: { matin: true, midi: false, soir: true, description: 'Matin et soir aux repas' }, duree: '1 à 2 mois', precautions: 'Effet laxatif possible à forte dose.' },
      { nom: 'Rhodiola ou ashwagandha', type: 'complement', usage: 'Plante adaptogène pour aider l\'organisme à gérer le stress.', posologie: { matin: true, midi: false, soir: false, description: 'Le matin, selon l\'étiquette' }, duree: '1 mois', precautions: 'Déconseillé aux femmes enceintes ; avis pharmacien si traitement en cours.' },
    ],
  },
  {
    mots: ['immunite', 'immunité', 'rhume', 'defenses', 'défenses', 'hiver'],
    reponse: "Pour soutenir les défenses naturelles à l'approche de l'hiver : vitamine D, zinc et une bonne hygiène de vie. Une fièvre élevée ou persistante nécessite un médecin.",
    produits: [
      { nom: 'Vitamine D3', type: 'complement', usage: 'Soutien de l\'immunité, surtout d\'octobre à avril.', posologie: { matin: true, midi: false, soir: false, description: 'Le matin, selon l\'étiquette' }, duree: 'Tout l\'hiver', precautions: 'Respecter la dose quotidienne.' },
      { nom: 'Zinc', type: 'complement', usage: 'Cure courte en soutien des défenses.', posologie: { matin: true, midi: false, soir: false, description: 'Le matin à jeun, selon l\'étiquette' }, duree: '1 mois', precautions: 'À distance du café et des produits laitiers.' },
    ],
  },
  {
    mots: ['muscle', 'courbature', 'articulation', 'entorse', 'hematome'],
    reponse: "Pour les petits bobos musculaires et articulaires, l'arnica en gel est le réflexe classique. Une douleur intense, une déformation ou une impossibilité de bouger imposent une consultation.",
    produits: [
      { nom: 'Gel d\'arnica', type: 'premiers-soins', usage: 'Masser doucement la zone douloureuse ou le bleu.', posologie: { matin: true, midi: true, soir: true, description: '2-3 applications par jour' }, duree: 'Quelques jours', precautions: 'Ne pas appliquer sur plaie ouverte.' },
    ],
  },
];

function conseilLocal(message) {
  const m = (message || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Plusieurs besoins dans un même message ("j'ai des boutons ET je dors mal")
  // → on combine les règles correspondantes (max 3 thèmes, max 5 produits).
  const matches = REGLES.filter((regle) =>
    regle.mots.some((mot) => m.includes(mot.normalize('NFD').replace(/[̀-ͯ]/g, '')))
  ).slice(0, 3);
  if (matches.length > 0) {
    return {
      reponse: matches.map((r) => r.reponse).join('\n\n'),
      produits: matches.flatMap((r) => r.produits).slice(0, 5),
      consulter_professionnel: false,
      source: 'regles',
    };
  }
  return {
    reponse: "Je n'ai pas de recommandation précise pour cette demande. Décrivez-moi votre besoin autrement (ex. « j'ai des boutons », « je dors mal », « je cherche des vitamines ») — ou demandez directement conseil à votre pharmacien, c'est son métier !",
    produits: [],
    consulter_professionnel: false,
    source: 'regles',
  };
}

/**
 * Point d'entrée principal.
 * @param {string} message - le message de l'utilisateur
 * @param {Array<{role: 'user'|'assistant', content: string}>} history - tours précédents
 */
// Signaux d'urgence : réponse fixe, AUCUN produit proposé, quel que soit le moteur (IA ou règles).
const URGENCES = [
  [/suicid|me tuer|envie de mourir|mettre fin a mes jours|en finir avec la vie/, "Ce que vous traversez est sérieux et vous n'avez pas à y faire face seul. Appelez le 3114, numéro national de prévention du suicide, gratuit, 24 h sur 24. En cas de danger immédiat, appelez le 15."],
  [/douleur (dans|a) la poitrine|douleur thoracique|mal (a|dans) la poitrine|serrement dans la poitrine|n.?arrive (pas|plus) a respirer|du mal a respirer|etouffe|paralys|bouche (qui se )?deform|perte de connaissance|evanoui|convulsion|vomi[st]? du sang|sang dans les selles|crache du sang|gonfl\w* (du visage|de la gorge|des levres|de la langue)|surdos|overdose|avale? (trop|toute la boite)|pire mal de tete|mal de tete (brutal|violent|soudain)|nuque raide/, "Ces signes peuvent relever d'une urgence médicale. Appelez le 15 (SAMU) ou le 112 maintenant. Je ne propose aucun produit dans cette situation."],
  [/(bebe|nourrisson|nouveau.?ne)\b.*(fievre|temperature)|(fievre|temperature).*\b(bebe|nourrisson|nouveau.?ne)/, "Une fièvre chez un nourrisson demande un avis médical rapide. Appelez votre médecin ou le 15. Je ne propose aucun produit dans cette situation."],
];

export function urgence(message) {
  const m = (message || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, ' ');
  const hit = URGENCES.find(([re]) => re.test(m));
  return hit ? { reponse: hit[1], produits: [], consulter_professionnel: true, source: 'securite' } : null;
}

export async function getConseil(message, history = []) {
  const alerte = urgence(message);
  if (alerte) return alerte;

  if (!process.env.ANTHROPIC_API_KEY) {
    return conseilLocal(message);
  }

  try {
    const client = new Anthropic();
    const messages = [
      ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return {
        reponse: "Je ne peux pas répondre à cette demande. Pour toute question de santé, adressez-vous à votre pharmacien ou votre médecin.",
        produits: [],
        consulter_professionnel: true,
        source: 'ia',
      };
    }

    const text = response.content.find((b) => b.type === 'text')?.text || '{}';
    const data = JSON.parse(text);
    return { ...data, source: 'ia' };
  } catch (e) {
    console.error('[conseil] Erreur IA, bascule sur les règles locales :', e.message);
    return conseilLocal(message);
  }
}

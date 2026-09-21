/* =============================================================================
   Albatros VFR — LE CATALOGUE DE LA BASE DIT-IL LA MÊME CHOSE QUE L'APPLICATION ?
   -----------------------------------------------------------------------------
   Ce contrôle existe à cause d'un angle mort que les autres n'ont pas pu voir.

   tests/contrat/phraseologie.test.mjs compare les treize scénarios de
   l'application aux treize lignes d'INSERT de sql/002-progression.sql. Il dit
   « 13 = 13 » — et il a raison, le fichier les contient bien.

   Mais un fichier de migration n'est pas une base de données. Le 19/09/2026, la
   base de production n'en contenait que SEPT : la migration corrigée avait été
   écrite, commitée, poussée — et jamais jouée. Aucun test ne pouvait le dire,
   parce que tous lisent le code, et que le code avait raison.

   ┌─ CE QUE COÛTENT LES SIX MANQUANTS ─────────────────────────────────────┐
   │ `sessions.exercise_key` porte une clé étrangère vers `exercises(key)`.  │
   │ PostgreSQL refuse la ligne ENTIÈRE (23503) si la clé n'y est pas.       │
   │ assets/sync.js a une ceinture : il réessaie UNE fois sans la clé. La    │
   │ séance est donc sauvée, mais détachée du catalogue. Ce que l'élève voit │
   │ depuis un autre appareil :                                              │
   │   · l'historique affiche « Scénario » au lieu du vrai nom ;             │
   │   · « Refaire ce scénario » ne fonctionne pas sur ces lignes ;           │
   │ et la console d'administration est aveugle à six exercices sur treize.  │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌─ STRICTEMENT EN LECTURE — SAUF DEUX SONDES QUI N'ÉCRIVENT RIEN ────────┐
   │ Le contrôle des politiques exige de tenter une écriture : c'est la      │
   │ seule façon de savoir, depuis l'extérieur, si elle est refusée. On      │
   │ envoie donc un INSERT dont la clé EXISTE DÉJÀ.                          │
   │   · si la politique refuse  → 42501, rien ne part ;                     │
   │   · si elle autorise        → la contrainte de clé primaire refuse la   │
   │                               ligne, et rien ne part non plus.          │
   │ Dans les deux cas la base est intacte. C'est vérifié en fin de course.  │
   └──────────────────────────────────────────────────────────────────────────┘

   USAGE
       node tests/verifier-catalogue.mjs
       sh tests/lancer_tout.sh base

   Il n'est PAS dans la suite par défaut : il a besoin du réseau et interroge
   le projet Supabase réel. Les tests, eux, coupent Supabase exprès.
   ========================================================================== */
import { lire, elementsDuTableau, toutLeCode } from './contrat/_source.mjs';

/* ---- Les coordonnées, lues là où l'application les lit ------------------- */
const cfg = lire('assets/supabase-config.js');
const URL = (/url:\s*'([^']+)'/.exec(cfg) || [])[1];
const CLE = (/anonKey:\s*'([^']+)'/.exec(cfg) || [])[1];
if (!URL || !CLE) {
  console.error('Coordonnées Supabase introuvables dans assets/supabase-config.js');
  process.exit(2);
}

const entetes = { apikey: CLE, Authorization: 'Bearer ' + CLE };
const rouge = t => `\x1b[31m${t}\x1b[0m`;
const vert = t => `\x1b[32m${t}\x1b[0m`;
let problemes = 0;

async function api(chemin, options = {}) {
  const r = await fetch(URL + '/rest/v1/' + chemin, {
    ...options,
    headers: { ...entetes, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const texte = await r.text();
  let corps = null;
  try { corps = texte ? JSON.parse(texte) : null; } catch (e) { corps = texte; }
  return { statut: r.status, corps };
}

/* ---- Ce que l'APPLICATION attend ---------------------------------------- */
const scenarios = (elementsDuTableau(toutLeCode(), 'SCENARIOS') || []).map(p => ({
  id: (/id\s*:\s*"([a-z]+)"/.exec(p) || [])[1],
  titre: (/titre\s*:\s*"([^"]+)"/.exec(p) || [])[1]
}));

console.log(`\n═══ CATALOGUE — l'application contre la base ═══`);
console.log(`    projet : ${URL}`);
console.log(`    l'application déclare ${scenarios.length} scénarios\n`);

/* ---- Ce que la BASE contient -------------------------------------------- */
const { statut, corps: enBase } = await api('exercises?select=key,title,is_active,sort_order&order=sort_order');
if (statut !== 200 || !Array.isArray(enBase)) {
  console.error(rouge(`  La table exercises n'a pas répondu (HTTP ${statut}).`));
  console.error(`  ${JSON.stringify(enBase)}`);
  process.exit(2);
}
const cles = new Set(enBase.map(e => e.key));
console.log(`    la base en contient ${enBase.length}\n`);

/* ---- 1. Les treize existent-ils ? --------------------------------------- */
const manquants = scenarios.filter(s => !cles.has(s.id));
if (manquants.length) {
  problemes++;
  console.log(rouge(`  ✖ ${manquants.length} exercice(s) attendu(s) par l'application et ABSENT(S) de la base :`));
  manquants.forEach(s => console.log(rouge(`      ${s.id.padEnd(14)} ${s.titre}`)));
  console.log(`\n    Conséquence : ces scénarios enregistrent leurs séances SANS rattachement`);
  console.log(`    au catalogue. L'historique les affiche « Scénario », « Refaire ce`);
  console.log(`    scénario » ne marche pas dessus, et la console d'administration ne les`);
  console.log(`    voit pas.\n`);
  console.log(`    Correctif : jouer sql/002-progression.sql — il est idempotent.`);
  console.log(`      SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-sql.sh sql/002-progression.sql\n`);
} else {
  console.log(vert(`  ✔ les ${scenarios.length} exercices de l'application existent en base`));
}

/* ---- 2. Des exercices en base que l'application ne connaît pas ? --------- */
const orphelins = enBase.filter(e => !scenarios.some(s => s.id === e.key));
if (orphelins.length) {
  problemes++;
  console.log(rouge(`  ✖ ${orphelins.length} exercice(s) en base sans scénario correspondant :`));
  orphelins.forEach(e => console.log(rouge(`      ${e.key}`)));
  console.log(`    Des séances peuvent y pointer sans que l'application sache les nommer.`);
} else {
  console.log(vert(`  ✔ aucun exercice orphelin en base`));
}

/* ---- 3. Les titres concordent-ils ? -------------------------------------- */
const divergents = enBase
  .map(e => ({ e, s: scenarios.find(x => x.id === e.key) }))
  .filter(({ e, s }) => s && s.titre !== e.title);
if (divergents.length) {
  problemes++;
  console.log(rouge(`  ✖ ${divergents.length} titre(s) divergent(s) :`));
  divergents.forEach(({ e, s }) => console.log(rouge(`      ${e.key} : « ${e.title} » en base, « ${s.titre} » dans l'application`)));
  console.log(`    L'élève voit l'un, la console d'administration l'autre.`);
} else {
  console.log(vert(`  ✔ les titres concordent`));
}

/* ---- 4. Des exercices désactivés ? --------------------------------------- */
const eteints = enBase.filter(e => !e.is_active);
if (eteints.length) {
  console.log(`  · ${eteints.length} exercice(s) marqué(s) inactif(s) : ${eteints.map(e => e.key).join(' ')}`);
  console.log(`    (ce n'est pas une erreur — mais il faut que ce soit voulu)`);
} else {
  console.log(vert(`  ✔ les ${enBase.length} exercices sont actifs`));
}

/* ---- 5. Ce que sql/002 devait poser À CÔTÉ du catalogue ------------------
   Les treize exercices ne sont que le § 1 de la migration. Elle pose aussi une
   colonne et quatre vues. Le 19/09/2026, un collage dans l'éditeur SQL a fait
   passer les exercices et RIEN de ce qui suivait : le catalogue était complet,
   la migration ne l'était pas. Un contrôle qui ne regarde que le catalogue
   aurait dit « conforme ».

   `profiles.etat_vol` porte le vol interrompu. Sans elle, un vol coupé au
   milieu ne se reprend que sur le navigateur où il a commencé — la
   fonctionnalité existe côté code et ne sert à personne. */
console.log(`\n═══ MIGRATION — ce que sql/002 doit avoir posé ═══\n`);

const attendus = [
  ['colonne', 'profiles?select=etat_vol&limit=0', 'profiles.etat_vol',
   'le vol interrompu ne se reprend que sur son navigateur d\'origine'],
  ['vue', 'v_daily_activity?select=*&limit=0', 'v_daily_activity',
   'la série de jours de pratique'],
  ['vue', 'v_daily_practice?select=*&limit=0', 'v_daily_practice',
   'la pratique quotidienne'],
  ['vue', 'v_missed_items?select=*&limit=0', 'v_missed_items',
   'les éléments les plus souvent manqués'],
  ['vue', 'v_user_progress?select=*&limit=0', 'v_user_progress',
   'la progression par exercice, lue par la page Compte']
];
for (const [genre, chemin, nom, pourquoi] of attendus) {
  const { statut, corps } = await api(chemin);
  if (statut === 200) {
    console.log(vert(`  ✔ ${genre.padEnd(8)} ${nom.padEnd(20)} présente`));
  } else {
    problemes++;
    const code = (corps && corps.code) || statut;
    console.log(rouge(`  ✖ ${genre.padEnd(8)} ${nom.padEnd(20)} ABSENTE (${code})`));
    console.log(rouge(`      Ce qui ne marche pas sans elle : ${pourquoi}.`));
  }
}
if (problemes) {
  console.log(`\n    sql/002-progression.sql n'est pas entièrement appliqué. Il est`);
  console.log(`    idempotent : le rejouer EN ENTIER ne casse rien et complète ce qui`);
  console.log(`    manque. Attention au collage dans l'éditeur SQL — le fichier fait`);
  console.log(`    390 lignes, et un collage partiel passe sans erreur visible.`);
}

/* ---- 6. Les politiques tiennent-elles ? ---------------------------------- */
console.log(`\n═══ POLITIQUES — ce qu'un visiteur anonyme peut faire ═══\n`);

const lectures = [
  ['exercises', true,  'le catalogue est public par conception'],
  ['profiles', false,  'un profil ne se lit que par son propriétaire'],
  ['sessions', false,  'une séance ne se lit que par son propriétaire'],
  ['session_steps', false, 'idem pour le détail des échanges']
];
for (const [table, doitRendreDesLignes, pourquoi] of lectures) {
  const { statut, corps } = await api(`${table}?select=*&limit=1`);
  const lit = statut === 200 && Array.isArray(corps) && corps.length > 0;
  if (lit === doitRendreDesLignes) {
    console.log(vert(`  ✔ lecture anonyme de ${table.padEnd(14)} ${lit ? 'permise' : 'vide'} — ${pourquoi}`));
  } else {
    problemes++;
    console.log(rouge(`  ✖ lecture anonyme de ${table.padEnd(14)} ${lit ? 'REND DES LIGNES' : 'ne rend rien'} — attendu : ${doitRendreDesLignes ? 'des lignes' : 'rien'}`));
    if (lit) console.log(rouge(`      ${pourquoi} — une politique manque ou a été élargie.`));
  }
}

console.log('');
const ecritures = [
  ['exercises', { key: enBase[0] ? enBase[0].key : 'roulage', title: 'sonde' },
   'seul un administrateur écrit le catalogue'],
  ['sessions', { user_id: '00000000-0000-0000-0000-000000000000', kind: 'scenario', status: 'done' },
   'une séance s\'écrit sous SON propre compte'],
  ['profiles', { id: '00000000-0000-0000-0000-000000000000' },
   'un profil ne se crée pas depuis le navigateur'],
  ['session_steps', { session_id: '00000000-0000-0000-0000-000000000000', idx: 0 },
   'un échange suit sa séance']
];
for (const [table, corpsEnvoye, pourquoi] of ecritures) {
  const { statut, corps } = await api(table, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(corpsEnvoye)
  });
  const refusee = statut === 401 || statut === 403 || (corps && corps.code === '42501');
  if (refusee) {
    console.log(vert(`  ✔ écriture anonyme dans ${table.padEnd(14)} refusée — ${pourquoi}`));
  } else {
    problemes++;
    console.log(rouge(`  ✖ écriture anonyme dans ${table.padEnd(14)} NON refusée (HTTP ${statut})`));
    console.log(rouge(`      ${pourquoi}`));
    console.log(rouge(`      La clé publiable est dans le code source du site : ce que ce test`));
    console.log(rouge(`      vient de tenter, n'importe qui peut le tenter. Vérifier la RLS de`));
    console.log(rouge(`      cette table — sql/003-is-admin-et-exercices.sql § 0 le diagnostique.`));
  }
}

/* ---- 7. La base est-elle bien intacte ? ---------------------------------- */
const apres = await api('exercises?select=key&order=sort_order');
const memeContenu = Array.isArray(apres.corps)
  && apres.corps.length === enBase.length
  && apres.corps.every((e, i) => e.key === enBase[i].key);
console.log('');
if (memeContenu) {
  console.log(vert(`  ✔ la base est inchangée : ${apres.corps.length} exercices, les mêmes qu'au début`));
} else {
  problemes++;
  console.log(rouge(`  ✖ LE CONTENU A CHANGÉ PENDANT LE CONTRÔLE — ne devrait jamais arriver.`));
}

console.log('');
if (problemes) {
  console.log(rouge(`${problemes} problème(s). Voir ci-dessus.\n`));
  process.exit(1);
}
console.log(vert(`Le catalogue et les politiques sont conformes.\n`));

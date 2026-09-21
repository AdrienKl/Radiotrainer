/* =============================================================================
   Albatros VFR — LE FILET DU DÉCOUPAGE
   -----------------------------------------------------------------------------
   Ce fichier est le plus important du dossier. Il surveille la seule chose qui
   peut casser l'application en silence pendant la migration.

   CE QU'IL SURVEILLE, ET POURQUOI
   Les blocs de script d'index.html ne sont pas étanches : soixante-deux noms
   déclarés dans l'un sont lus par un autre. `speakATC`, `startListening`,
   `AERODROMES`, `rtSettings`, `state`… La Navigation seule emprunte une
   trentaine de symboles au moteur de scénarios. Rien de tout cela ne passe par
   `window` : ce sont des liaisons de portée globale, celles qu'un script
   classique offre gratuitement — et silencieusement.

   Trois façons de casser ça, toutes invisibles à la lecture :

     1. le symbole DISPARAÎT — on croit avoir déplacé un bloc entier, il en
        manque quinze lignes ;
     2. le symbole est déclaré DEUX fois — le bloc a été copié au lieu d'être
        déplacé. Avec `const`, le navigateur lève une SyntaxError et la page
        entière meurt ;
     3. le symbole est déclaré TROP TARD — le fichier extrait est chargé après
        celui qui s'en sert. Là, rien ne se voit au chargement : la page se
        peint, et c'est au premier clic que « speakATC is not defined » tombe
        dans une console que personne ne regarde.

   Le troisième est le vrai danger, et c'est celui qu'un œil humain ne voit pas.

   ┌─ CE TEST N'INTERDIT PAS DE DÉPLACER DU CODE ───────────────────────────┐
   │ Il vérifie qu'un symbole existe ENCORE, une SEULE fois, et AVANT ceux   │
   │ qui le lisent. Où il vit ne le regarde pas. C'est précisément ce qui    │
   │ permet de sortir un bloc vers assets/ sans toucher au test.            │
   └────────────────────────────────────────────────────────────────────────┘
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scripts, declarationsRacine, utilise, inventaire, VENDOR } from './_source.mjs';

const nos = scripts().filter(s => !VENDOR.includes(s.src));
const inv = inventaire();

/* Qui déclare quoi, dans l'ordre de chargement. */
const declarations = new Map();       // symbole -> [index de script, …]
nos.forEach((s, i) => {
  for (const nom of declarationsRacine(s.code)) {
    if (!declarations.has(nom)) declarations.set(nom, []);
    declarations.get(nom).push(i);
  }
});

test('aucun symbole partagé n\'a disparu', () => {
  const manquants = inv.symboles_partages
    .filter(s => !declarations.has(s.nom))
    .map(s => `${s.nom} (était dans ${s.declare}, lu par ${s.lu_par.join(', ')})`);
  assert.deepEqual(manquants, [],
    `Ces symboles ne sont plus déclarés nulle part. Le code qui les lit tombera ` +
    `en « is not defined » au premier usage, pas au chargement.`);
});

test('aucun symbole partagé n\'est déclaré deux fois', () => {
  const doubles = inv.symboles_partages
    .filter(s => (declarations.get(s.nom) || []).length > 1)
    .map(s => `${s.nom} : ${declarations.get(s.nom).map(i => nos[i].origine).join(' ET ')}`);
  assert.deepEqual(doubles, [],
    `Déclaré deux fois. Si c'est un const ou un let, le navigateur lève une ` +
    `SyntaxError et TOUTE la page s'arrête. Le bloc a probablement été copié ` +
    `au lieu d'être déplacé.`);
});

/* ---------------------------------------------------------------------------
   Lire un symbole déclaré PLUS LOIN dans la page : quand c'est légitime.

   Le projet le fait déjà, exprès, et il a raison. Le moteur de scénarios lit
   `NAV_AD_GEO` et `NAV_AVIONS`, qui vivent dans assets/aerodromes-geo.js et
   assets/avions.js — chargés tout à la fin. Ça marche parce que la lecture se
   produit DANS UNE FONCTION, appelée après le chargement complet de la page, et
   jamais au moment où le bloc s'exécute.

   Mais ça ne marche que si la lecture est protégée : `typeof NAV_AD_GEO !==
   'undefined' ? … : …`. Sans cette protection, le jour où le fichier manque —
   téléversement incomplet, 404 — ce n'est plus une fonctionnalité absente,
   c'est une ReferenceError qui arrête la fonction en cours.

   Le test ne cherche donc pas à interdire ces lectures tardives. Il exige
   qu'elles soient gardées — ou, à défaut, INSCRITES dans l'inventaire, ce qui
   revient à dire « je sais, et voici pourquoi ». Le second cas existe pour les
   appels écrits dans le corps d'une fonction, qui ne sont évalués que le jour
   où la fonction est appelée : phraseologie-scenarios.js appelle ainsi le
   moteur depuis le buildTours() du scénario « navigation ».

   Ce qui reste interdit, et c'est le seul vrai danger : une lecture NOUVELLE,
   ni gardée ni inscrite.
   ------------------------------------------------------------------------- */
test('aucune lecture anticipée nouvelle, ni gardée ni inscrite', () => {
  const connues = new Set(inv.lectures_differees || []);
  const fautes = [];
  for (const s of inv.symboles_partages) {
    const iDecl = (declarations.get(s.nom) || [])[0];
    if (iDecl === undefined) continue;             // déjà signalé par le test ci-dessus
    nos.forEach((script, i) => {
      if (i >= iDecl || !utilise(script.code, s.nom)) return;
      if (new RegExp(`typeof\\s+${s.nom}\\b`).test(script.code)) return;   // gardée
      if (connues.has(`${s.nom}@${script.origine}`)) return;               // inscrite
      fautes.push(`${s.nom} : lu sans garde par ${script.origine}, qui charge AVANT ${nos[iDecl].origine}`);
    });
  }
  assert.deepEqual(fautes, [],
    `Ce symbole est lu par un script qui charge avant celui qui le déclare, sans ` +
    `« typeof » et sans être inscrit dans lectures_differees.\n` +
    `  · Si la lecture est immédiate : c'est une ReferenceError au chargement, et ` +
    `tout le reste du bloc est perdu avec elle.\n` +
    `  · Si elle est différée (dans le corps d'une fonction) : la garder, ou la ` +
    `regeler en sachant ce qu'on inscrit.`);
});

test('les lectures différées inscrites existent toujours', () => {
  /* Une inscription qui ne correspond plus à rien est une permission qui traîne.
     On la retire, pour que la liste reste une liste de cas réels. */
  const fantomes = (inv.lectures_differees || []).filter(entree => {
    const [nom, origine] = entree.split('@');
    const script = nos.find(s => s.origine === origine);
    return !script || !utilise(script.code, nom);
  });
  assert.deepEqual(fantomes, [],
    `Ces lectures différées sont inscrites mais n'existent plus. Regeler ` +
    `l'inventaire pour les retirer : une permission oubliée finit par couvrir ` +
    `autre chose.`);
});

test('les prises de test de l\'application sont toujours là', () => {
  /* Elles ne servent pas qu'aux tests : la page #admin/test de la console
     d'administration les appelle. Les perdre casse une page visible. */
  const tout = nos.map(s => s.code).join('\n');
  for (const prise of ['RT_TEST', 'RT_TEST_EPEL', 'rtRelancerScenario', 'RT_SCENARIOS_MAP']) {
    assert.ok(new RegExp(`window\\.${prise}\\s*=`).test(tout),
      `window.${prise} n'est plus exposé — la console d'administration (#admin/test) s'en sert.`);
  }
});

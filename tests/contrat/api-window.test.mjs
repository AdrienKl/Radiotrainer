/* =============================================================================
   AVIERO — L'API QUI PASSE PAR window, ET POURQUOI ELLE EST FRAGILE
   -----------------------------------------------------------------------------
   Il y a deux façons, dans ce projet, qu'un fichier en atteigne un autre :

     · en lisant le nom NU — `normalize(...)`. Le symbole doit exister dans la
       portée globale de script. S'il manque, c'est une ReferenceError, bruyante ;

     · en passant par `window.X` — `window.rtConfirm(...)`, presque toujours
       derrière un `if (window.rtConfirm)`. S'il manque, il ne se passe RIEN.
       Pas d'erreur, pas de message : le bouton ne fait simplement plus ce qu'il
       annonce.

   Le second est celui de la console d'administration, et c'est le dangereux.

   ┌─ LE PIÈGE, QUI EST UNE RÈGLE DU LANGAGE ───────────────────────────────┐
   │ Au niveau racine d'un script classique :                                │
   │     function f(){}   et   var v = …     →  deviennent window.f, window.v │
   │     const c = …      et   let l = …     →  N'Y SONT PAS                  │
   │                                                                          │
   │ Transformer `function showToast(...)` en `const showToast = (...) =>`    │
   │ est un changement qu'on fait sans y penser en rangeant du code. Il ne    │
   │ casse rien à l'écran, il ne casse rien dans les tests existants — il     │
   │ retire showToast de window, et la console d'administration cesse         │
   │ d'afficher ses messages. Personne ne le verra avant longtemps.           │
   └──────────────────────────────────────────────────────────────────────────┘

   Ce fichier fige donc la NATURE des déclarations, pas seulement leur présence.
   Il est écrit AVANT l'extraction du noyau (étape 2.2) : il constate d'abord
   l'état actuel, et ne sert de filet qu'ensuite.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scripts, sansCommentairesNiChaines, VENDOR } from './_source.mjs';

const nos = scripts().filter(s => !VENDOR.includes(s.src));
const tout = nos.map(s => s.code).join('\n');

/* Ce que d'autres fichiers atteignent par window.X, et qui est declare chez nous.
   Releve le 19/09/2026 sur le code servi ; a completer si un nouveau consommateur
   apparait. */
const API = [
  { nom: 'rtConfirm', lu_par: 'la console d\'administration (errors, test)',
    casse: 'les confirmations avant effacement disparaissent : le bouton efface sans demander, ou ne fait rien' },
  { nom: 'showToast', lu_par: 'la console d\'administration (errors, test)',
    casse: 'les messages de confirmation ne s\'affichent plus, les actions semblent sans effet' },
  { nom: 'Voix', lu_par: 'assets/modules/parametres.js',
    casse: 'le bouton « essayer la voix » des Paramètres ne dit plus rien' },
  { nom: 'rtBadges', lu_par: 'assets/modules/tableau-de-bord.js',
    casse: 'les badges du tableau de bord restent vides' },
  { nom: 'rtRelancerScenario', lu_par: 'le tableau de bord et #admin/test',
    casse: 'relancer un scénario depuis l\'accueil ne fait plus rien' },
  { nom: 'RT_SCENARIOS_MAP', lu_par: 'assets/donnees.js',
    casse: 'une séance lue en base ne retrouve plus son scénario : l\'historique affiche des lignes sans titre' }
];

/* Nettoye UNE fois : deux mega-octets de code, et huit tests qui le relisent
   chacun, c'etait six secondes pour une question qui en vaut une demie. */
const NU = sansCommentairesNiChaines(tout);

/* Une declaration racine qui ATTERRIT sur window : function, var, ou window.X = */
function poseSurWindow(nom) {
  const nu = NU;
  const par = t => new RegExp(`^${t}\\s+${nom}\\b`, 'm').test(nu);
  return {
    fonction: par('function') || par('async function'),
    variable: par('var'),
    explicite: new RegExp(`^window\\.${nom}\\s*=`, 'm').test(nu),
    constante: par('const') || par('let')
  };
}

for (const { nom, lu_par, casse } of API) {
  test(`window.${nom} existe encore`, () => {
    const d = poseSurWindow(nom);
    assert.ok(d.fonction || d.variable || d.explicite,
      `window.${nom} n'est plus pose sur window.\n` +
      `  Lu par : ${lu_par}\n` +
      `  Ce qui casse : ${casse}\n` +
      (d.constante
        ? `  CAUSE TROUVEE : ${nom} est declare en const ou let. Au niveau racine, ` +
          `const et let ne deviennent PAS des proprietes de window. Repasser en ` +
          `« function » ou « var », ou exposer explicitement : window.${nom} = ${nom};`
        : `  Le symbole n'est declare nulle part au niveau racine.`));
  });
}

test('aucun de ces symboles n\'est enferme dans une IIFE', () => {
  /* Une declaration indentee est a l'interieur de quelque chose. Elle peut etre
     parfaitement correcte — mais alors elle n'est plus sur window, et il faut
     l'exposer a la main. Ce test le signale plutot que de le laisser passer. */
  const nu = NU;
  const enfermes = API.map(a => a.nom).filter(nom => {
    const racine = new RegExp(`^(?:function|async function|var)\\s+${nom}\\b|^window\\.${nom}\\s*=`, 'm').test(nu);
    const ailleurs = new RegExp(`^\\s+(?:function|var|const|let)\\s+${nom}\\b`, 'm').test(nu);
    return !racine && ailleurs;
  });
  assert.deepEqual(enfermes, [],
    `Ces symboles ne sont plus declares au niveau racine. S'ils sont passes dans ` +
    `une IIFE ou un module, ils ont quitte window en silence : ajouter un ` +
    `window.X = X explicite.`);
});

test('la configuration Supabase reste posee sur window', () => {
  /* Quatre fichiers la lisent via window.RT_SUPABASE. Sans elle, le client se
     cree sans URL ni cle et TOUTE l'authentification echoue au chargement. */
  assert.match(NU, /^window\.RT_SUPABASE\s*=/m);
});

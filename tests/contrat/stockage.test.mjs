/* =============================================================================
   AVIERO — LES CLÉS DE STOCKAGE NE SE RENOMMENT PAS TOUTES SEULES
   -----------------------------------------------------------------------------
   Renommer une clé du stockage local efface des données utilisateur SANS AUCUN
   message d'erreur : l'ancienne clé reste dans le navigateur, plus personne ne
   la lit, et l'application affiche un historique vide comme si de rien n'était.
   C'est la panne la plus discrète du projet (CLAUDE.md § 7.2).

   Deux clés méritent d'être nommées :
     · `rt-auth` est le storageKey de Supabase. Le renommer déconnecte tout le
       monde, d'un coup, sans que personne comprenne pourquoi.
     · `rt-sync-file` contient les séances qui n'ont pas encore pu partir en
       base. Le renommer les perd définitivement.

   Ce test ne juge pas de l'usage d'une clé — il vérifie seulement qu'aucune ne
   s'est évaporée entre deux étapes de découpage. Une clé qui doit réellement
   changer de nom demande une migration à un coup (copie ancienne → nouvelle,
   ancienne conservée deux versions), puis la regénération de l'inventaire.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scripts, lire, inventaire, VENDOR } from './_source.mjs';

const inv = inventaire();
const tout = lire('index.html') + '\n' +
  scripts().filter(s => !VENDOR.includes(s.src) && s.externe).map(s => s.code).join('\n');

test('aucune clé de stockage n\'a disparu', () => {
  const disparues = inv.cles_stockage.filter(k => !tout.includes(`'${k}'`) && !tout.includes(`"${k}"`));
  assert.deepEqual(disparues, [],
    `Ces clés ne sont plus nommées nulle part. Si c'est un renommage, il lui ` +
    `faut une migration : sans elle, les données déjà présentes chez les ` +
    `utilisateurs deviennent illisibles, en silence.`);
});

test('aucune clé nouvelle n\'apparaît sans être inventoriée', () => {
  const vues = [...new Set((tout.match(/['"](rt-[a-z-]+|radiotrainer_history_v2)['"]/g) || [])
    .map(s => s.replace(/['"]/g, '')))];
  const inconnues = vues.filter(k => !inv.cles_stockage.includes(k));
  assert.deepEqual(inconnues, [],
    `Nouvelle clé de stockage. Ce n'est pas interdit — mais une clé de plus est ` +
    `une donnée de plus qui ne suit pas le compte d'un appareil à l'autre. ` +
    `Vérifier si elle ne devrait pas plutôt vivre en base (CLAUDE.md § 7), puis ` +
    `regénérer l'inventaire.`);
});

test('rt-auth reste le storageKey de Supabase', () => {
  const auth = lire('assets/auth.js');
  assert.match(auth, /storageKey\s*:\s*'rt-auth'/,
    `Le storageKey de Supabase n'est plus 'rt-auth' : toutes les sessions ` +
    `ouvertes deviennent introuvables, donc tout le monde est déconnecté.`);
});

test('la file d\'attente des séances garde son nom', () => {
  const sync = lire('assets/sync.js');
  assert.match(sync, /FILE\s*=\s*'rt-sync-file'/,
    `Les séances en attente d'envoi sont stockées sous ce nom. Le changer les ` +
    `abandonne dans le navigateur, sans qu'elles atteignent jamais la base.`);
});

test('le cache local porte le nom de son propriétaire', () => {
  /* Sans cela, deux personnes qui se succèdent sur le même ordinateur voient
     l'historique l'une de l'autre : le cache de la première est encore là, et
     l'écran se peint AVANT que la base ait répondu. RLS tient bon en base —
     mais la fuite est à l'écran, et elle suffit. */
  const donnees = lire('assets/donnees.js');
  assert.match(donnees, /rt-cache-proprio/,
    `L'estampille du cache a disparu : l'historique d'un utilisateur peut ` +
    `s'afficher chez le suivant sur le même navigateur.`);
});

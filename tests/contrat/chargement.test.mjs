/* =============================================================================
   AVIERO — L'ORDRE DE CHARGEMENT EST UN CONTRAT
   -----------------------------------------------------------------------------
   Deux ordres comptent dans ce projet, et aucun des deux ne se devine à la
   lecture.

   1) L'ORDRE DES FEUILLES DE STYLE, parce que c'est la cascade.
      admin.css charge APRÈS le CSS du site, volontairement : la console doit
      pouvoir surcharger. Et à l'intérieur du site, plusieurs règles sont
      placées après celles qu'elles corrigent — le code le dit lui-même :
      « placé APRÈS les règles .vf-* d'origine pour les surcharger ».
      Inverser deux fichiers ne produit aucune erreur. Ça produit un site qui
      ne ressemble plus à rien, et on cherche ailleurs.

   2) L'ORDRE DES SCRIPTS, parce que les blocs se lisent les uns les autres.
      Le détail est dans symboles.test.mjs ; ici on surveille la liste
      elle-même, y compris les fichiers qui n'y sont plus.

   Ce test tombe aussi quand un fichier est référencé mais absent du disque —
   la panne classique d'un téléversement incomplet, que le site ne signale
   qu'à l'endroit exact où le fichier manquant devait servir.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE, scripts, styles, inventaire, lire } from './_source.mjs';

const inv = inventaire();

test('tous les fichiers référencés par la page existent', () => {
  const absents = [...scripts(), ...styles()]
    .filter(m => m.externe && !existsSync(join(RACINE, m.src)))
    .map(m => m.src);
  assert.deepEqual(absents, [],
    `Référencé par index.html, absent du disque. En production ce fichier ` +
    `renvoie une 404 et la fonctionnalité qu'il porte disparaît sans message.`);
});

test('l\'ordre des feuilles de style est inchangé', () => {
  assert.deepEqual(styles().map(s => s.origine), inv.ordre_styles,
    `La cascade a changé. Un découpage du CSS doit conserver l'ordre EXACT : ` +
    `plusieurs règles du site ne valent que par leur position après une autre.`);
});

test('l\'ordre des scripts est inchangé', () => {
  assert.deepEqual(scripts().map(s => s.origine), inv.ordre_scripts,
    `L'ordre de chargement a changé. Si c'est voulu (extraction d'un bloc), ` +
    `regénérer l'inventaire APRÈS avoir vérifié que symboles.test.mjs passe.`);
});

test('admin.css charge après le CSS du site', () => {
  const noms = styles().map(s => s.origine);
  const site = noms.findIndex(n => n.startsWith('index.html') || /assets\/css\//.test(n));
  const admin = noms.indexOf('assets/admin/admin.css');
  assert.ok(site >= 0 && admin > site,
    `admin.css doit charger après le CSS du site pour pouvoir le surcharger.`);
});

test('le thème est posé avant la première peinture', () => {
  /* Ce bloc doit rester le PREMIER script de la page et rester INLINE. Sorti
     dans un fichier, il devient une requête réseau de plus : la page se peint
     en clair, puis bascule en sombre sous les yeux de l'utilisateur. C'est la
     seule raison pour laquelle il n'est pas dans assets/. */
  const premier = scripts()[0];
  assert.ok(!premier.externe,
    `Le premier script de la page n'est plus inline : le thème sombre ` +
    `s'appliquera après la première peinture, avec un flash blanc visible.`);
  assert.match(premier.code, /rt-settings/);
  assert.match(premier.code, /data-theme/);
});

test('la configuration Supabase charge avant ce qui s\'en sert', () => {
  const noms = scripts().map(s => s.origine);
  const cfg = noms.indexOf('assets/supabase-config.js');
  const lib = noms.indexOf('assets/vendor/supabase.js');
  const auth = noms.indexOf('assets/auth.js');
  assert.ok(cfg >= 0 && lib > cfg && auth > lib,
    `Ordre attendu : supabase-config.js, puis la bibliothèque, puis auth.js. ` +
    `Autrement le client se crée sans URL ni clé, et toute l'authentification ` +
    `échoue au chargement.`);
});

test('le manuel de phraséologie est toujours publié', () => {
  /* La page Cours l'intègre telle quelle. C'est aussi la source de vérité de
     toute la phraséologie du projet : il est versionné exprès. */
  assert.ok(existsSync(join(RACINE, 'Manuel_Phraseologie.pdf')));
  assert.match(lire('index.html'), /Manuel_Phraseologie\.pdf/);
});

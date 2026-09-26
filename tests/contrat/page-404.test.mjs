/* =============================================================================
   Albatros VFR — LA PAGE 404 CONNAÎT LES MÊMES ROUTES QUE LE ROUTEUR
   -----------------------------------------------------------------------------
   404.html renvoie /login vers /#login, /exercices vers /#exercices… à partir
   d'une liste écrite dans le fichier. Elle ne peut pas lire celle du routeur :
   c'est une page à part, servie par GitHub Pages quand aucun fichier ne
   correspond. Deux copies de la même liste, donc — et la copie oubliée ne
   produit AUCUNE erreur : une route ajoutée au routeur et pas ici tombe
   simplement sur « Cette page n'existe pas ». Ce test compare les deux.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lire } from './_source.mjs';

function liste(source, nom) {
  const m = new RegExp(nom + '\\s*=\\s*\\[([^\\]]*)\\]').exec(source);
  assert.ok(m, `tableau ${nom} introuvable`);
  return [...m[1].matchAll(/'([a-z]+)'/g)].map(x => x[1]).sort();
}

test('404.html redirige exactement les routes du tableau PAGES', () => {
  const pages  = liste(lire('assets/modules/routeur.js'), 'var PAGES');
  const routes = liste(lire('404.html'), 'var ROUTES');
  assert.deepEqual(routes, pages,
    'la liste ROUTES de 404.html doit être celle de PAGES dans routeur.js');
});

test('404.html emploie des chemins absolus', () => {
  /* Servie à n'importe quelle profondeur (/a/b/c) : un chemin relatif
     « assets/… » y chercherait /a/b/assets/…, et la page perdrait ses
     couleurs et sa carte sans la moindre erreur visible. */
  const src = lire('404.html');
  const relatifs = [...src.matchAll(/(?:href|src)="(?!\/|#|data:|https?:)([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(relatifs, [], 'chemins relatifs dans 404.html');
  assert.doesNotMatch(src, /url\("(?!\/|data:)/, 'url() relatif dans 404.html');
});

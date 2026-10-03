/* =============================================================================
   Albatros VFR — CE QUE CLOUDFLARE PUBLIE
   -----------------------------------------------------------------------------
   outils/construire-site.mjs copie dans dist/ une LISTE BLANCHE, et Cloudflare
   (wrangler.jsonc) ne publie que dist/. Deux pannes silencieuses à empêcher :
     1. un fichier que le site charge n'est pas dans la liste → il manque en
        ligne, et SEULEMENT là (le serveur local des tests sert tout le dépôt) ;
     2. un fichier interne y entre → docs, SQL, tests, node_modules publiés.
   Plus les limites de Cloudflare Workers Static Assets : 25 Mio par fichier,
   20 000 fichiers par version (offre gratuite).
   Ajouté le 28/09/2026, avec le passage à Cloudflare.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { RACINE, lire } from './_source.mjs';
import { listerPublies, TAILLE_MAX } from '../../outils/construire-site.mjs';

const publies = listerPublies();
const chemins = new Set(publies.map(f => f.chemin));

/* Un chemin local (ni http, ni #, ni data:), sans requête ni ancre. */
function local(u) {
  if (!u || /^(https?:|data:|mailto:|tel:|#|%23|javascript:)/i.test(u)) return null;
  return u.split(/[?#]/)[0];
}

test('tout ce que index.html et 404.html chargent est publié', () => {
  const manquants = [];
  for (const [page, s] of [['index.html', lire('index.html')], ['404.html', lire('404.html')]]) {
    for (const m of s.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      const u = local(m[1]); if (!u || u === '/') continue;
      const c = u.replace(/^\//, '');
      if (!chemins.has(c)) manquants.push(page + ' → ' + m[1]);
    }
  }
  assert.deepEqual(manquants, [], 'référencé par la page, absent de dist/');
});

test('toutes les images des feuilles de style sont publiées', () => {
  const manquants = [];
  for (const f of readdirSync(join(RACINE, 'assets/css'))) {
    for (const m of lire('assets/css/' + f).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const u = local(m[1]); if (!u) continue;
      const c = posix.normalize(posix.join('assets/css', u));
      if (!chemins.has(c)) manquants.push(f + ' → ' + m[1]);
    }
  }
  assert.deepEqual(manquants, []);
});

test('les fichiers nommés en dur dans le JavaScript sont publiés (dont le manuel PDF)', () => {
  const manquants = [];
  for (const { chemin } of publies.filter(f => f.chemin.endsWith('.js'))) {
    const s = lire(chemin);
    for (const m of s.matchAll(/['"]((?:assets\/)[^'"\s{}$]+\.(?:webp|png|jpe?g|svg|pdf|js|css|json|mp3|wav))['"]/g))
      if (!chemins.has(m[1]) && !(OACI_RETIREE && /^assets\/oaci2?\//.test(m[1])))
        manquants.push(chemin + ' → ' + m[1]);
    for (const m of s.matchAll(/['"]([A-Za-z0-9_-]+\.pdf)['"]/g))
      if (!chemins.has(m[1])) manquants.push(chemin + ' → ' + m[1]);
  }
  assert.deepEqual(manquants, []);
  // Le manuel n'est plus publié (02/10/2026) : la page Cours ne l'affiche plus.
  assert.ok(!chemins.has('Manuel_Phraseologie.pdf'), 'le manuel PDF ne part plus en ligne');
});

/* La carte OACI a quitté le site le 03/10/2026 (LEGAL.md § 2) : aucun titre pour
   en rediffuser les tuiles. Tant que tuiles-oaci.js › OACI_PUBLIEE est faux, ses
   deux sondes nomment des tuiles absentes sans jamais les demander — et AUCUNE
   tuile ne doit partir en ligne, même remise par erreur dans le dépôt. */
const OACI_RETIREE = /var OACI_PUBLIEE = false;/.test(lire('assets/modules/tuiles-oaci.js'));
test('carte OACI retirée : aucune tuile n\'est publiée', () => {
  assert.ok(OACI_RETIREE, 'OACI_PUBLIEE est repassé à true : licence obtenue ? retirer alors ce test');
  assert.deepEqual(publies.map(f => f.chemin).filter(c => /^assets\/oaci2?\/.*\.webp$|carte-oaci/.test(c)), []);
});

test('rien d\'interne n\'est publié', () => {
  const interdits = publies.map(f => f.chemin).filter(c =>
    /^(node_modules|\.git|\.github|\.wrangler|dist|sql|tests|supabase|outils|originaux|test-results|playwright-report)\//.test(c)
    || /\.(md|sql|sh|ts|toml|mjs|jsonc|lock)$/i.test(c)
    || /(^|\/)(package(-lock)?\.json|wrangler\.jsonc?|playwright\.config\.js|CNAME|\.nojekyll|\.gitignore|\.DS_Store|\.env[^/]*)$/.test(c)
    || /^assets\/donnees\/phraseologie-manuel\.json$/.test(c));
  assert.deepEqual(interdits, []);
});

test('dans les limites de Cloudflare : 25 Mio par fichier, 20 000 fichiers', () => {
  assert.deepEqual(publies.filter(f => f.taille > TAILLE_MAX).map(f => f.chemin), []);
  assert.ok(publies.length < 20000, publies.length + ' fichiers');
});

test('wrangler.jsonc publie dist/, avec la page 404 pour toute adresse inconnue', () => {
  const brut = lire('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
  const cfg = JSON.parse(brut);
  assert.equal(cfg.assets.directory, './dist', 'publier « . » publierait node_modules et tout le dépôt');
  assert.equal(cfg.assets.not_found_handling, '404-page');
  assert.equal(cfg.main, undefined, 'aucun code de Worker : un site statique');
});

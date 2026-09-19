/* =============================================================================
   AVIERO — LE ROUTEUR ET LES TROIS PAGES QUI DOIVENT RESTER OUVERTES
   -----------------------------------------------------------------------------
   Le routeur tient une liste de pages, et chaque page de cette liste doit
   trouver sa section dans le document. Un découpage qui déplace du HTML peut
   très bien laisser la liste intacte et emporter la section : la route existe,
   le clic fonctionne, et l'écran reste blanc.

   ┌─ LE POINT QUI N'EST PAS UNE QUESTION DE CONFORT ───────────────────────┐
   │ « mentions », « cgu » et « confidentialite » sont dans PAGES mais PAS   │
   │ dans APP_PAGES : elles se lisent SANS COMPTE. Ce n'est pas un choix     │
   │ d'ergonomie, c'est l'article 13 du RGPD — il faut pouvoir lire ce à     │
   │ quoi on consent avant de s'inscrire. Les faire basculer côté            │
   │ application les rendrait inaccessibles à qui n'a pas de compte.         │
   └────────────────────────────────────────────────────────────────────────┘
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lire, inventaire, toutLeCode } from './_source.mjs';

/* DEUX SOURCES, ET IL FAUT LES DISTINGUER.

   Le balisage des pages (<section id="page-…">) vit dans index.html : c'est du
   HTML, il n'ira nulle part ailleurs.

   Le CODE du routeur, lui, a quitté index.html à l'étape 2.1 pour
   assets/modules/routeur.js. Ce test lisait les deux dans index.html et a donc
   cassé le jour du déplacement — alors que le routeur, lui, marchait
   parfaitement. C'était le test qui était écrit contre un FICHIER au lieu du
   code réellement servi au navigateur.

   La règle, ici comme ailleurs : on interroge ce que le navigateur charge, pas
   l'endroit où on croit que ça se trouve. */
const html = lire('index.html');      // le balisage
const code = toutLeCode();            // tout le JavaScript servi, d'où qu'il vienne
const inv = inventaire();

const listeDe = (nom) => {
  const m = new RegExp(`var\\s+${nom}\\s*=\\s*\\[([^\\]]+)\\]`).exec(code);
  assert.ok(m, `La liste ${nom} du routeur est introuvable.`);
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
};

test('la liste des pages du routeur est intacte', () => {
  assert.deepEqual(listeDe('PAGES'), inv.pages,
    `Une route a été ajoutée ou retirée. Si c'est voulu, regénérer l'inventaire ` +
    `— et vérifier au passage qu'une nouvelle page publique n'entre pas par ` +
    `inadvertance dans la partie réservée aux comptes.`);
});

/* « compte » est le seul nom de PAGES sans section à lui, et c'est voulu : la
   page Compte a été fondue dans Paramètres. La route n'a pas été retirée parce
   que des liens et des favoris la désignent — la faire tomber sur l'accueil
   l'aurait cassée en silence. Elle est donc redirigée dans showPage().
   Ce test admet l'exception, mais exige la redirection : si quelqu'un retire le
   renvoi sans rétablir la section, la route mène à un écran vide. */
const REDIRIGEES = { compte: 'parametres' };

test('chaque page du routeur a sa section dans le document', () => {
  const orphelines = inv.pages
    .filter(p => !html.includes(`id="page-${p}"`))
    .filter(p => !REDIRIGEES[p]);
  assert.deepEqual(orphelines, [],
    `Route déclarée, section absente : le clic mène à un écran vide, sans erreur ` +
    `dans la console.`);
});

test('les routes sans section sont bien redirigées', () => {
  for (const [de, vers] of Object.entries(REDIRIGEES)) {
    assert.ok(!html.includes(`id="page-${de}"`) === true,
      `La section page-${de} est revenue : retirer la redirection, ou ce test.`);
    assert.match(code, new RegExp(`name===['"]${de}['"]\\s*\\)\\s*\\{\\s*name\\s*=\\s*['"]${vers}['"]`),
      `La route #${de} n'a plus de section ET plus de redirection : elle mène ` +
      `désormais à un écran vide pour tous ceux qui ont gardé le lien.`);
  }
});

test('les trois pages légales restent accessibles sans compte', () => {
  const app = listeDe('APP_PAGES');
  for (const page of ['mentions', 'cgu', 'confidentialite']) {
    assert.ok(inv.pages.includes(page), `La page « ${page} » a quitté le routeur.`);
    assert.ok(!app.includes(page),
      `« ${page} » est passée dans APP_PAGES : elle exige désormais un compte. ` +
      `Ces trois pages doivent être lisibles AVANT l'inscription (RGPD art. 13).`);
  }
});

test('les pages applicatives sont bien des pages du routeur', () => {
  const intrus = listeDe('APP_PAGES').filter(p => !inv.pages.includes(p));
  assert.deepEqual(intrus, [],
    `Une page applicative n'existe pas dans PAGES : elle n'est atteignable par ` +
    `aucune route.`);
});

test('la console d\'administration reste une page du routeur', () => {
  /* Une seule application, un seul historique, une seule barre d'adresse : la
     console n'est pas un second site. C'est aussi ce qui lui donne ses
     sous-routes (#admin/users/u_007). */
  assert.ok(inv.pages.includes('admin'));
  assert.ok(html.includes('id="page-admin"'));
});

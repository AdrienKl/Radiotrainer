/* =============================================================================
   Albatros VFR — LE CATALOGUE DU MANUEL NE SE DÉGRADE PAS EN SILENCE
   -----------------------------------------------------------------------------
   `assets/donnees/phraseologie-manuel.json` est la transcription complète du
   manuel DSNA : 1 058 répliques, avec qui parle. Il n'est pas écrit à la main,
   il est PRODUIT par `outils/extraire-manuel.py` (CLAUDE.md § 2).

   CE QUE CE TEST PEUT VÉRIFIER — ET CE QU'IL NE PEUT PAS
   Il ne peut pas ouvrir le PDF et juger qu'une phrase est fidèle : seul un œil
   humain le peut, le manuel à côté. Ce qu'il empêche, c'est la dégradation
   muette :

     · le fichier DISPARAÎT, ou cesse d'être du JSON lisible ;
     · une entrée perd son locuteur, sa page ou ses deux langues à la fois ;
     · le décompte annoncé dans `meta` cesse de décrire le contenu — signe
       qu'on a édité le fichier à la main au lieu de le refaire ;
     · et surtout : UNE RÉPLIQUE CHANGE DE BOUCHE.

   Le dernier point est celui qui compte. Attribuer au pilote une phrase du
   contrôleur, c'est enseigner une erreur — exactement ce que le § 2 interdit.
   L'attribution est déduite des pictogrammes du PDF (manuel p. 8) ; c'est la
   seule partie déduite qui pourrait faire un dégât réel, donc c'est celle qu'on
   surveille. Les six ancres ci-dessous sont les six phrases du circuit VFR que
   `PHRASEOLOGIE-MANUEL.md` documente page par page : si l'une d'elles change de
   locuteur ou de libellé après une regénération, ce test rougit.

   Les deux ancres de décollage et d'atterrissage sont là pour une raison
   précise : l'édition 10 du manuel a justement corrigé ce point (récapitulatif
   des mises à jour, pages 59-60-61-154-156-161-172). Le pilote dit « je
   décolle » et « j'atterris » ; « autorisé décollage » et « autorisé
   atterrissage » sont réservés à l'ATC. C'est la correction n° 1 et n° 2 de
   `PHRASEOLOGIE-MANUEL.md`, et rien ne doit la défaire.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './_source.mjs';

const CHEMIN = join(RACINE, 'assets/donnees/phraseologie-manuel.json');

test('le catalogue du manuel existe et se lit', () => {
  assert.ok(existsSync(CHEMIN),
    'assets/donnees/phraseologie-manuel.json a disparu. Il se refait :\n' +
    '  python3 outils/extraire-manuel.py assets/donnees/phraseologie-manuel.json');
  assert.doesNotThrow(() => JSON.parse(readFileSync(CHEMIN, 'utf8')));
});

const cat = existsSync(CHEMIN) ? JSON.parse(readFileSync(CHEMIN, 'utf8')) : null;

test("l'outil qui le produit est versionné avec lui", () => {
  assert.ok(existsSync(join(RACINE, 'outils/extraire-manuel.py')),
    'Sans le script, le catalogue n’est plus refaisable — donc plus vérifiable.');
});

test('chaque entrée porte un locuteur, une page et au moins une langue', () => {
  const LOCUTEURS = new Set(['pilote', 'controleur', 'vehicule', 'atis']);
  const vus = new Set();
  for (const e of cat.entrees) {
    assert.ok(LOCUTEURS.has(e.locuteur), `${e.id} : locuteur inconnu « ${e.locuteur} »`);
    assert.ok(Number.isInteger(e.page) && e.page >= 1 && e.page <= 263,
      `${e.id} : page ${e.page} hors du manuel`);
    assert.ok((e.fr || '').trim() || (e.en || '').trim(), `${e.id} : ni français ni anglais`);
    assert.ok(!vus.has(e.id), `identifiant en double : ${e.id}`);
    vus.add(e.id);
  }
});

test('le décompte annoncé décrit bien le contenu', () => {
  // Il diverge dès qu'on édite le fichier à la main plutôt que de le refaire.
  assert.equal(cat.meta.compte.entrees, cat.entrees.length);
  const parLocuteur = {};
  for (const e of cat.entrees) parLocuteur[e.locuteur] = (parLocuteur[e.locuteur] || 0) + 1;
  assert.deepEqual(cat.meta.compte.parLocuteur, parLocuteur);
});

test('le manuel reste cité : source, édition et décalage de pagination', () => {
  assert.match(cat.meta.fichier, /Manuel_Phraseologie\.pdf/);
  assert.match(cat.meta.edition, /15 avril 2023/);
  assert.match(cat.meta.pageImprimee, /\+ 18/);   // page PDF = page imprimée + 18
});

/* Les six phrases du circuit VFR, avec leur page et leur bouche.
   Source : PHRASEOLOGIE-MANUEL.md, lui-même tiré du PDF. */
const ANCRES = [
  { page: 59,  locuteur: 'controleur', contient: 'autorisé décollage' },
  { page: 59,  locuteur: 'pilote',     contient: 'je décolle' },
  { page: 154, locuteur: 'controleur', contient: 'autorisé atterrissage' },
  { page: 154, locuteur: 'pilote',     contient: "j'atterris" },
  { page: 53,  locuteur: 'controleur', contient: 'Alignez-vous et attendez' },
  { page: 53,  locuteur: 'pilote',     contient: "Je m'aligne et j'attends" },
];

for (const a of ANCRES) {
  test(`p.${a.page} — « ${a.contient} » reste dans la bouche du ${a.locuteur}`, () => {
    const dits = cat.entrees.filter(e => e.page === a.page && (e.fr || '').includes(a.contient));
    assert.ok(dits.length, `« ${a.contient} » a disparu de la page ${a.page}`);
    for (const e of dits) {
      assert.equal(e.locuteur, a.locuteur,
        `${e.id} (p.${e.page}) met « ${a.contient} » dans la bouche du ${e.locuteur} :\n` +
        `  ${e.fr}\n` +
        `  Le manuel l'attribue au ${a.locuteur}. Une réplique qui change de bouche,\n` +
        `  c'est une erreur que l'élève apprendra (CLAUDE.md § 2).`);
    }
  });
}

test('aucune réplique du pilote ne délivre une clairance', () => {
  // « autorisé décollage » / « autorisé atterrissage » sont réservés à l'ATC :
  // c'est LA correction de l'édition 10 (pages 59-60-61-154-156-161-172).
  const fautifs = cat.entrees.filter(e =>
    e.locuteur === 'pilote' && /autoris[ée]\s+(décollage|atterrissage)/i.test(e.fr || ''));
  assert.deepEqual(fautifs.map(e => `${e.id} p.${e.page} : ${e.fr}`), []);
});

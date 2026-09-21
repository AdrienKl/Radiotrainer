/* =============================================================================
   Albatros VFR — LE CODE SERVI AU NAVIGATEUR SE LIT SANS ERREUR
   -----------------------------------------------------------------------------
   Une erreur de syntaxe dans un bloc inline d'index.html n'arrête pas la page :
   elle arrête CE BLOC. Les autres continuent de s'exécuter, la page se peint,
   et seule la fonctionnalité portée par le bloc mort a disparu. C'est
   exactement ce qui rend ce type de faute coûteux pendant un découpage : on
   coupe une accolade de trop, la page a l'air normale, et c'est la Navigation
   qui ne répond plus.

   Le test passe chaque script au lecteur de Node. Il ne juge que la forme —
   savoir si le code FAIT la bonne chose est le travail des tests de parcours.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scripts, VENDOR } from './_source.mjs';

const dossier = mkdtempSync(join(tmpdir(), 'albatros-syntaxe-'));

for (const s of scripts()) {
  if (VENDOR.includes(s.src)) continue;        // pas notre code
  test(`syntaxe : ${s.origine}`, () => {
    const f = join(dossier, s.origine.replace(/[^\w.]/g, '_') + '.js');
    writeFileSync(f, s.code);
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      assert.fail(`${s.origine} ne se lit pas :\n${e.stderr?.toString() || e.message}`);
    }
  });
}

test('aucun script n\'est vide', () => {
  const vides = scripts().filter(s => s.code.trim().length === 0).map(s => s.origine);
  assert.deepEqual(vides, [],
    `Script vide : soit le fichier manque sur le disque, soit un bloc a été ` +
    `vidé sans être retiré de la page.`);
});

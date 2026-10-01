/* =============================================================================
   Albatros VFR — LE TYPE D'AVION, SOUS TOUTES SES ÉCRITURES (01/10/2026)
   -----------------------------------------------------------------------------
   Retour du développeur : il a dit « DA50 », la transcription a rendu
   « da 50 », et le type a été compté FAUX — seule la forme collée était
   acceptée. Et, trouvé en écrivant ce test : le correcteur flou réécrivait
   des noms d'avions en mots radio (« Jodel » → « hotel », « Pitts » →
   « piste », « CAP10 » → « cap »).
   Ici : les 176 types de la Navigation et les 4 des Scénarios, chacun sous sa
   forme écrite, séparée (« da 50 »), collée (« da50 »), épelée (« d a 50 »),
   à tirets ; quelques formes dites en lettres ; et aucun autre type ne doit
   valider le bon (« DA 40 » pour un DA50).
   ========================================================================== */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { ouvrir } from './_aide.js';

const src = fs.readFileSync('assets/modules/navigation.js', 'utf8');
const debut = src.indexOf('var AIRCRAFT=[');
const bloc = src.slice(debut, src.indexOf('].map(', debut));
const TYPES = [...bloc.matchAll(/\["[^"]*","([^"]*)"/g)].map(m => m[1])
  .concat(['DR400', 'CESSNA 172', 'PIPER PA28', 'TB10']);

test('chaque type est reconnu sous toutes ses écritures, Scénarios et Navigation', async ({ page }) => {
  expect(TYPES.length).toBeGreaterThan(150);
  await ouvrir(page);
  const ko = await page.evaluate((types) => {
    const ko = [];
    for (const a of types) {
      const sep = a.toLowerCase().replace(/-/g, ' ').replace(/([a-z])(\d)/g, '$1 $2')
        .replace(/(\d)([a-z])/g, '$1 $2').replace(/\s+/g, ' ');
      const formes = new Set([a, sep, sep.replace(/\b([a-z]{1,4}) (\d+)\b/g, '$1$2'),
        sep.replace(/\b([a-z]{2,4})(?= \d)/g, m => m.split('').join(' ')), a.replace(/ /g, '-')]);
      for (const f of formes) {
        const c = fuzzyCorrect('Chartres sol, F-BYFO, ' + f + ', au parking, demande consignes de roulage');
        if (!mcFound({ label: 't', variantes: typeAvionVariantes(a) }, c)) ko.push('Navigation ' + a + ' ← ' + f + ' → ' + c);
        if (!typeVariants(a).some(v => mcFound({ label: 't', variantes: [v] }, c))) ko.push('Scénarios ' + a + ' ← ' + f);
      }
    }
    return ko;
  }, TYPES);
  expect(ko).toEqual([]);
});

test('dit en lettres, ou avec la marque : reconnu ; un autre type : refusé', async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(() => {
    const ok = (a, f) => mcFound({ label: 't', variantes: typeAvionVariantes(a) }, fuzzyCorrect('F-BYFO, ' + f + ', au parking'));
    return {
      lettres: [['DA50', 'DA cinquante'], ['PA-28', 'PA vingt-huit'], ['DR400', 'DR quatre cents'],
        ['CESSNA 172', 'Cessna cent soixante-douze'], ['DA50', 'Diamond DA 50']].filter(([a, f]) => !ok(a, f)),
      autres: [['DA50', 'DA 40'], ['DR400', 'DR 401'], ['PA-28', 'PA 18'], ['TB10', 'TB 20']].filter(([a, f]) => ok(a, f))
    };
  });
  expect(r.lettres).toEqual([]);
  expect(r.autres).toEqual([]);
});

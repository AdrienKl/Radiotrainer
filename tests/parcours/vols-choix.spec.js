/* =============================================================================
   Albatros VFR — LES DÉCISIONS DU PILOTE EN NAVIGATION (03/10/2026)
   -----------------------------------------------------------------------------
   Vol local : tours de piste ou sortie en zone puis retour ; à chaque finale,
   complet, toucher, remise de gaz, passage bas (selon le terrain). Terrain AFIS
   (manuel AFIS UAF & FA / DGAC) et auto-information (arrêté du 12/07/2019) :
   aucune clairance. Chaque vol est JOUÉ jusqu'au bout, réponses exactes, et
   chaque réponse doit être notée entière.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer, lireCle } from './_aide.js';

async function voler(page, cfg, choix, graine = 2) {
  await page.evaluate(g => window.RT_TEST.forcerGraine(g), graine);
  const avions = await page.evaluate(() => window.RT_TEST.avions());
  await page.evaluate(() => window.RT_TEST.forcerAlea('aucun'));
  const err = await page.evaluate(([c, a]) => window.RT_TEST.lancerVol(Object.assign({ avion: a }, c)), [cfg, avions[0]]);
  expect(err).toBeNull();
  const dits = [];
  for (let k = 0; k < 160; k++) {
    const e = await page.evaluate(() => window.RT_TEST.etat());
    if (!e) break;
    if (e.choix) {
      const voulu = choix.length ? choix[0] : e.choix[0];
      const kx = e.choix.includes(voulu) ? (choix.shift(), voulu) : e.choix[0];
      dits.push('[' + e.ph + ' : ' + kx + ' parmi ' + e.choix.join('/') + ']');
      await page.evaluate(x => window.RT_TEST.choisir(x), kx);
      continue;
    }
    if (e.attendu) {
      const manque = await page.evaluate(() => window.RT_TEST.repondreJuste());
      dits.push(e.attendu);
      expect(manque, `« ${e.attendu} » (${e.ph}) n'est pas notée entière`).toEqual([]);
    }
    const ok = await page.evaluate(() => window.RT_TEST.suivant());
    expect(ok, `bloqué à « ${e.ph} »`).toBe(true);
  }
  expect(await page.evaluate(() => window.RT_TEST.enVol()), 'le vol ne s\'est pas terminé').toBe(false);
  return dits;
}

test('Vol local, terrain contrôlé : tours de piste avec toucher, passage bas, remise de gaz, puis complet', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const d = await voler(page, { dep: 'LFBD', mode: 'local' },
    ['circuits', 'toucher', 'normal', 'passagebas', 'encadrement', 'remise', 'bassehauteur', 'complet']);
  const t = d.join(' | ');
  expect(t).toMatch(/\[Décision : circuits parmi circuits\/zone\]/);
  expect(t).toMatch(/finale piste [^,]+, demande toucher\./);
  expect(t).toMatch(/autorisé toucher|Atterrissage complet/);
  expect(t).toMatch(/demande exercice d'encadrement/);
  expect(t).toMatch(/demande circuit basse hauteur/);
  expect(t).toMatch(/Je roule parking aviation générale/);
  expect(erreurs).toEqual([]);
});

test('Vol local, terrain contrôlé : sortie en zone, retour « pour un toucher »', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const d = await voler(page, { dep: 'LFBD', mode: 'local' }, ['zone', 'toucher', 'complet']);
  const t = d.join(' | ');
  expect(t).toMatch(/Sortie de circuit, je quitte la fréquence/);
  expect(t).toMatch(/, bonjour, F-/);
  expect(t).toMatch(/VFR, pour un toucher, \d+ pieds/);
});

test('Vol local sur un terrain AFIS : manuel AFIS, aucune clairance', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const afis = await page.evaluate(() => window.RT_TEST.unTerrain('afis'));
  test.skip(!afis, 'pas de terrain AFIS');
  const d = await voler(page, { dep: afis, mode: 'local' }, ['circuits', 'attendre', 'complet']);
  const t = d.join(' | ');
  expect(t).toMatch(/Information, bonjour, F-/);
  expect(t).toMatch(/demandons paramètres pour le départ/);
  expect(t).toMatch(/roulons point d'attente piste/);
  expect(t).toMatch(/nous alignons piste/);
  expect(t).toMatch(/Décollons piste/);
  expect(t).toMatch(/Rappellerons finale piste/);
  expect(t).toMatch(/au parking, quittons la fréquence/);
  expect(t, 'aucune clairance en AFIS').not.toMatch(/je décolle|j'atterris|autorisé|Numéro \d|je roule et entre/i);
  expect(erreurs).toEqual([]);
});

test('Vol local en auto-information : la station à chaque message, aucune réponse', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const aa = await page.evaluate(() => window.RT_TEST.unTerrain('aa'));
  test.skip(!aa, 'pas de terrain en auto-information');
  const d = await voler(page, { dep: aa, mode: 'local' }, ['circuits', 'remise', 'complet']);
  const t = d.filter(x => !x.startsWith('[')).join(' | ');
  expect(t).toMatch(/auto-information, F-[A-Z]+, roulons point d'attente piste/);
  expect(t).toMatch(/auto-information, F-[A-Z]+, remettons les gaz piste/);
  expect(t).toMatch(/auto-information, F-[A-Z]+, vent arrière piste/);
  expect(t).toMatch(/auto-information, F-[A-Z]+, au parking, quittons la fréquence/);
});

test('Voyage vers un terrain contrôlé : décision en finale, et un toucher avant le complet', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const d = await voler(page, { dep: 'LFBH', arr: 'LFBD', mode: 'voyage' }, ['toucher', 'complet']);
  const t = d.join(' | ');
  expect(t).toMatch(/\[Décision : toucher parmi complet\/toucher\/remise\/passagebas\]/);
  expect(t).toMatch(/Je roule parking aviation générale/);
  expect(erreurs).toEqual([]);
});

test('Une décision est rejouée à la reprise du vol', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  await page.evaluate(() => localStorage.removeItem('rt-vol-en-cours'));
  const avions = await page.evaluate(() => window.RT_TEST.avions());
  await page.evaluate(a => window.RT_TEST.lancerVol({ dep: 'LFBD', mode: 'local', avion: a }), avions[0]);
  for (let k = 0; k < 40; k++) {
    const e = await page.evaluate(() => window.RT_TEST.etat());
    if (e.choix) { await page.evaluate(() => window.RT_TEST.choisir('zone')); break; }
    if (e.attendu) await page.evaluate(() => window.RT_TEST.repondreJuste());
    await page.evaluate(() => window.RT_TEST.suivant());
  }
  await page.evaluate(() => window.RT_TEST.suivant());
  const v = await lireCle(page, 'rt-vol-en-cours');
  expect(v.choix, 'la décision n\'est pas sauvegardée').toEqual([{ id: 'local', key: 'zone' }]);
  expect(typeof v.graine).toBe('number');
});

test('Voyages AFIS → tour et tour → AFIS : chaque échange de sa source, joué en entier', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const afis = await page.evaluate(() => window.RT_TEST.unTerrain('afis'));
  test.skip(!afis, 'pas de terrain AFIS');
  let t = (await voler(page, { dep: afis, arr: 'LFBD', mode: 'voyage' }, ['complet'])).join(' | ');
  expect(t).toMatch(/sortie de circuit, quittons la fréquence/);
  expect(t).toMatch(/Je roule parking aviation générale/);
  t = (await voler(page, { dep: 'LFBD', arr: afis, mode: 'voyage' }, ['attendre', 'complet'])).join(' | ');
  expect(t).toMatch(/rappellerons en vue de l'aérodrome/);
  expect(t).toMatch(/au parking, quittons la fréquence/);
  expect(erreurs).toEqual([]);
});

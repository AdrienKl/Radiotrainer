/* =============================================================================
   Albatros VFR — UN VOL COMPLET, DE LA PRÉPARATION À L'HISTORIQUE
   -----------------------------------------------------------------------------
   La page Navigation est le deuxième gros module du projet (≈3 500 lignes) et
   celui qui emprunte le plus au moteur de scénarios : une trentaine de symboles,
   dont la voix du contrôleur, la reconnaissance, la correction floue et les
   réglages. Un découpage qui casse un seul de ces emprunts casse le vol.

   Les tests passent par window.RT_TEST — la prise que la console
   d'administration utilise déjà pour sa page #admin/test. Elle ne crée aucune
   logique de vol : elle réinjecte une configuration dans les mêmes variables
   que le formulaire, puis appelle startFlight(). C'est le chemin de « Refaire
   ce vol ».
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer, lireCle } from './_aide.js';

test('un vol se lance depuis une configuration complète', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(500);

  const avions = await page.evaluate(() => window.RT_TEST.avions());
  expect(avions.length, 'Aucun type d\'avion disponible').toBeGreaterThan(0);

  const err = await page.evaluate(a => window.RT_TEST.lancerVol({
    dep: 'LFBD', arr: 'LFBH', avion: a, mode: 'voyage', level: 'debutant', fl: 3500, pax: 1
  }), avions[0]);
  expect(err, 'Le vol a été refusé').toBeNull();

  expect(await page.evaluate(() => window.RT_TEST.enVol()), 'Le vol ne tourne pas').toBe(true);
  expect(erreurs, 'Erreurs de console pendant le vol').toEqual([]);
});

test('un vol interrompu peut être repris', async ({ page }) => {
  /* La reprise s'appuie sur rt-vol-en-cours. Sans cette clé, un vol coupé au
     milieu — onglet fermé, téléphone verrouillé — est perdu, et c'est le genre
     de perte qu'on ne remarque qu'une fois arrivé chez l'utilisateur. */
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  await page.evaluate(() => localStorage.removeItem('rt-vol-en-cours'));

  const avions = await page.evaluate(() => window.RT_TEST.avions());
  await page.evaluate(a => window.RT_TEST.lancerVol({ dep: 'LFBD', arr: 'LFBH', avion: a, mode: 'voyage' }), avions[0]);
  await page.waitForTimeout(600);

  const sauvegarde = await lireCle(page, 'rt-vol-en-cours');
  expect(sauvegarde, 'Rien n\'est sauvegardé pendant le vol : une interruption le perd.').toBeTruthy();
});

test('un vol terminé entre dans l\'historique', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  await page.evaluate(() => localStorage.removeItem('rt-vols'));

  const avions = await page.evaluate(() => window.RT_TEST.avions());
  await page.evaluate(a => window.RT_TEST.lancerVol({ dep: 'LFBD', arr: 'LFBH', avion: a, mode: 'voyage' }), avions[0]);
  await page.waitForTimeout(500);

  /* reinitialiser() clôt le vol EXACTEMENT comme le bouton « Terminer le vol » :
     débriefing puis enregistrement. Pas de second chemin de sortie. */
  await page.evaluate(() => window.RT_TEST.reinitialiser());
  await page.waitForTimeout(600);

  const vols = await lireCle(page, 'rt-vols');
  expect(Array.isArray(vols) && vols.length > 0,
    'Le vol s\'est terminé mais rien n\'a été enregistré dans rt-vols.').toBe(true);
  expect(await page.evaluate(() => window.RT_TEST.enVol())).toBe(false);
});

test('un vol local part sans aérodrome d\'arrivée', async ({ page }) => {
  /* Deux modes, deux règles : le mode « voyage » exige une arrivée, le mode
     « local » ne doit pas la réclamer. */
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const avions = await page.evaluate(() => window.RT_TEST.avions());

  const err = await page.evaluate(a => window.RT_TEST.lancerVol({ dep: 'LFBD', avion: a, mode: 'local' }), avions[0]);
  expect(err, 'Un vol local a été refusé faute d\'arrivée').toBeNull();
  expect(await page.evaluate(() => window.RT_TEST.enVol())).toBe(true);
});

test('un vol voyage sans arrivée est refusé, avec un motif', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const avions = await page.evaluate(() => window.RT_TEST.avions());

  const err = await page.evaluate(a => window.RT_TEST.lancerVol({ dep: 'LFBD', avion: a, mode: 'voyage' }), avions[0]);
  expect(err, 'Un vol voyage sans arrivée a été accepté').toBeTruthy();
  expect(err).toMatch(/arriv/i);
});

test('un imprévu peut être imposé au vol suivant', async ({ page }) => {
  /* C'est ce que fait la page #admin/test pour rejouer un aléa précis. Si la
     prise cesse de fonctionner, cette page devient inutilisable. */
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);

  await page.evaluate(() => window.RT_TEST.forcerAlea('moteur'));
  expect(await page.evaluate(() => window.RT_TEST.aleaImpose())).toBe('moteur');
});

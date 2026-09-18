/* =============================================================================
   AVIERO — L'ÉPELLATION RADIO
   -----------------------------------------------------------------------------
   Module volontairement isolé du moteur de scénarios : instance micro
   indépendante, aucune variable partagée. Il emprunte seulement des données
   (NATO, AERODROMES) et des outils (normalize, correctToken, evaluate) au bloc
   principal — ce qui en fait, pour la migration, un bon révélateur : si le
   découpage casse un de ces emprunts, c'est ici que ça se voit en premier.

   Comme pour les scénarios, on n'utilise pas de micro : RT_TEST_EPEL.dire()
   dépose une transcription là où la reconnaissance vocale la dépose, puis
   déclenche l'évaluation. C'est le chemin exact d'un relâchement d'alternat.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

test('l\'épellation donne un code et connaît sa réponse', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'epellation');
  await page.waitForTimeout(400);

  const attendu = await page.evaluate(() => window.RT_TEST_EPEL.attendu());
  expect(attendu.trim().length, 'Aucun code à épeler n\'a été tiré').toBeGreaterThan(0);
  await expect(page.locator('#spellCode')).not.toBeEmpty();
  expect(erreurs).toEqual([]);
});

test('épeler correctement donne un verdict positif', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'epellation');
  await page.waitForTimeout(400);

  const attendu = await page.evaluate(() => window.RT_TEST_EPEL.attendu());
  await page.evaluate(a => window.RT_TEST_EPEL.dire(a), attendu);
  await page.waitForTimeout(300);

  await expect(page.locator('#spellFeedback .spell-verdict'),
    'Aucun verdict rendu après une épellation').toBeVisible();
  await expect(page.locator('#spellFeedback .spell-verdict.good'),
    `L'épellation exacte (« ${attendu} ») n'a pas été reconnue juste.`).toBeVisible();
});

test('une épellation fausse est refusée', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'epellation');
  await page.waitForTimeout(400);

  await page.evaluate(() => window.RT_TEST_EPEL.dire('alpha bravo charlie delta echo'));
  await page.waitForTimeout(300);

  const bon = await page.locator('#spellFeedback .spell-verdict.good').count();
  expect(bon, 'Une épellation quelconque a été acceptée : le verdict ne vaudrait plus rien.').toBe(0);
});

test('« code suivant » tire un nouveau code', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'epellation');
  await page.waitForTimeout(400);

  const premier = await page.evaluate(() => window.RT_TEST_EPEL.attendu());
  /* Deux tirages peuvent tomber sur le même code : on en demande plusieurs. */
  let different = false;
  for (let i = 0; i < 8 && !different; i++) {
    await page.evaluate(() => window.RT_TEST_EPEL.suivant());
    await page.waitForTimeout(120);
    const suivant = await page.evaluate(() => window.RT_TEST_EPEL.attendu());
    if (suivant !== premier) different = true;
  }
  expect(different, 'Le code ne change jamais : l\'exercice tourne en boucle sur le même.').toBe(true);
});

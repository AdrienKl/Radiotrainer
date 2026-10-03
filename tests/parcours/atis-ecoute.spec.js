/* =============================================================================
   Albatros VFR — L'ATIS DOIT ÊTRE ENTENDU (03/10/2026, demande du développeur)
   -----------------------------------------------------------------------------
   « Suivant » restait ouvert sur l'écoute de l'ATIS : on passait l'étape sans
   rien écouter, puis on appelait la tour avec une lettre devinée. Il ne s'ouvre
   plus qu'une fois le poste accordé et le message entendu en entier (ou, si la
   voix ne rend jamais la main, après la durée de lecture estimée).
   Les autres tests tiennent l'ATIS pour entendu (window.RT_ATIS_IMMEDIAT, posé
   par _aide.js) ; celui-ci le remet à false.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

test('Scénario : « Suivant » fermé tant que l\'ATIS n\'a pas été entendu', async ({ page }) => {
  test.setTimeout(90000);
  await ouvrir(page);
  await page.evaluate(() => { window.RT_ATIS_IMMEDIAT = false; });
  await entrer(page, 'exercices');
  expect(await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'))).toBe(true);
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ atis: !!currentStep().atisStep, ferme: document.getElementById('nextBtn').disabled }));
  test.skip(!st.atis, 'Bordeaux sans ATIS dans les données');
  expect(st.ferme, '« Suivant » ouvert avant toute écoute').toBe(true);

  // Poste calé ailleurs : toujours fermé.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => document.getElementById('nextBtn').disabled)).toBe(true);

  // On affiche la fréquence ATIS : la diffusion part, et « Suivant » s'ouvre à la fin.
  await page.evaluate(() => { scRadio.act = Number(currentStep().freq); scMajEcouteAtis(); });
  await page.waitForFunction(() => !document.getElementById('nextBtn').disabled, null, { timeout: 70000 });
});

test('Navigation : « Suivant » fermé sur l\'ATIS tant qu\'il n\'est pas écouté', async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => { window.RT_ATIS_IMMEDIAT = false; });
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const avions = await page.evaluate(() => window.RT_TEST.avions());
  await page.evaluate(a => window.RT_TEST.lancerVol({ dep: 'LFBD', mode: 'local', avion: a }), avions[0]);
  const e = await page.evaluate(() => window.RT_TEST.etat());
  test.skip(!e.ecoute, 'Bordeaux sans ATIS dans les données');
  expect(e.suivant, '« Suivant » ouvert avant toute écoute').toBe(false);
});

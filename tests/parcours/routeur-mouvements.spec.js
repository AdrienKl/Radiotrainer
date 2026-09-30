/* =============================================================================
   Albatros VFR — LA VERSION TÉLÉPHONE ET LES MOUVEMENTS (30/09/2026)
   -----------------------------------------------------------------------------
   Le nom contient « routeur » pour que le projet « telephone » le joue aussi
   (playwright.config.js) : chaque test dit lui-même s'il vaut pour l'écran
   étroit, l'ordinateur, ou les deux.

   Ce qui est surveillé, et pourquoi :
     · sur téléphone, plus de barre du bas (retirée le 30/09/2026) : le menu
       est le tiroir de gauche, et le bouton Contact ne le recouvre pas ;
     · sur ordinateur, la tour de l'accueil reste ;
     · l'encadré « Chrome, Edge ou Safari » est là où l'on tape son adresse, et
       il le dit plus fort quand le navigateur n'a pas de reconnaissance ;
     · AU REPOS, l'onglet choisi garde son propre fond violet : la pastille qui
       glisse ne doit jamais devenir le seul fond de son texte blanc
       (assets/modules/mouvements.js, en-tête).
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

const etroit = page => (page.viewportSize()?.width || 1280) <= 860;

test('téléphone : pas de barre du bas, le menu est le tiroir de gauche, le bouton Contact s\'efface', async ({ page }) => {
  test.skip(!etroit(page), 'écran étroit seulement');
  await ouvrir(page);
  await entrer(page, 'tableau');
  /* Barre d'onglets retirée le 30/09/2026 : elle prenait trop de place. */
  expect(await page.locator('#tabbar').count()).toBe(0);
  await page.locator('#hamburger').click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await expect(page.locator('.ct-fab')).toBeHidden();
  await page.waitForTimeout(600);
  await page.locator('.sidelink[data-page="progression"]').click();
  await expect(page.locator('#page-progression')).toBeVisible();
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
});

test('téléphone : la tour de contrôle n\'est plus sur l\'accueil', async ({ page }) => {
  test.skip(!etroit(page), 'écran étroit seulement');
  await ouvrir(page);
  await expect(page.locator('.hero__title')).toBeVisible();
  await expect(page.locator('.hero__tour')).toBeHidden();
});

test('ordinateur : la tour reste, le menu est à gauche', async ({ page }) => {
  test.skip(etroit(page), 'ordinateur seulement');
  await ouvrir(page);
  await expect(page.locator('.hero__tour')).toBeVisible();
  await entrer(page, 'tableau');
  await expect(page.locator('#sidebar')).toBeVisible();
});

test('l\'encadré « Chrome, Edge ou Safari » suit le champ d\'adresse, à la connexion et à l\'inscription', async ({ page }) => {
  await ouvrir(page);
  for (const [route, champ, cadre] of [['login', '#loginId', '#loginNavRequis'], ['signup', '#insEmail', '#insNavRequis']]) {
    await page.evaluate(r => { location.hash = '#' + r; }, route);
    await expect(page.locator(cadre)).toBeVisible();
    await expect(page.locator(cadre)).toContainText('Chrome, Edge ou Safari');
    /* JUSTE sous le champ : l'élément qui suit le bloc du champ. */
    const suit = await page.evaluate(([c, k]) =>
      document.querySelector(c).closest('.auth-field').nextElementSibling === document.querySelector(k), [champ, cadre]);
    expect(suit, `${cadre} n'est pas juste sous ${champ}`).toBe(true);
    /* Chrome a la reconnaissance : pas de ligne « pas compatible ». */
    await expect(page.locator(`${cadre} .nav-requis__ici`)).toBeHidden();
  }
});

test('un navigateur sans reconnaissance vocale se l\'entend dire', async ({ page }) => {
  await page.addInitScript(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
  await ouvrir(page);
  await page.evaluate(() => { location.hash = '#login'; });
  await expect(page.locator('#loginNavRequis .nav-requis__ici')).toBeVisible();
  await expect(page.locator('#loginNavRequis')).toHaveClass(/nav-requis--ici/);
});

test('au repos, l\'onglet choisi porte son propre fond (la pastille ne le remplace pas)', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'parametres');
  await page.locator('#setTab-voix').click();
  await page.waitForTimeout(800);
  const etat = await page.evaluate(() => {
    const t = document.querySelector('#setTab-voix');
    return { fond: getComputedStyle(t).backgroundColor, glisse: t.parentElement.classList.contains('glisse'),
             pastille: !!t.parentElement.querySelector(':scope > .glisseur') };
  });
  expect(etat.pastille, 'la pastille n\'a pas été posée').toBe(true);
  expect(etat.glisse).toBe(false);
  expect(etat.fond).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});
